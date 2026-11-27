const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

// Read .env without requiring dotenv
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const { pool, initDb, initAdminSettings } = require("./db");

const app = express();
const server = http.createServer(app);
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "").trim();
const io = new Server(server, { cors: { origin: FRONTEND_ORIGIN || "*" } });

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured.");
}
const SECRET = process.env.JWT_SECRET;


// Allow an explicitly configured static frontend (for example GitHub Pages).
// Local same-origin Termux use does not need any CORS configuration.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && FRONTEND_ORIGIN && origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Please log in." });
  }
}


async function adminAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: "Please log in first." });
  }

  try {
    const result = await pool.query(
      "SELECT id, username, is_admin FROM users WHERE id = $1",
      [payload.id]
    );

    const account = result.rows[0];
    if (!account || account.is_admin !== true) {
      return res.status(403).json({ error: "Admin access required." });
    }

    req.admin = account;
    next();
  } catch (error) {
    console.error("Admin authentication error:", error.message);
    res.status(500).json({ error: "Could not verify Admin access." });
  }
}

app.get("/api/settings", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key=$1",
      ["always_show_brilliant_move"]
    );
    res.json({
      alwaysShowBrilliantMove: result.rows[0]?.value === true
    });
  } catch (error) {
    console.error("Settings error:", error.message);
    res.status(500).json({ error: "Could not load settings." });
  }
});

app.get("/api/admin/settings", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key=$1",
      ["always_show_brilliant_move"]
    );
    res.json({
      alwaysShowBrilliantMove: result.rows[0]?.value === true
    });
  } catch (error) {
    res.status(500).json({ error: "Could not load admin settings." });
  }
});

app.post("/api/admin/settings/brilliant-move", adminAuth, async (req, res) => {
  const enabled = req.body.enabled;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be true or false." });
  }

  try {
    await pool.query(
      `INSERT INTO app_settings(key,value,updated_at)
       VALUES($1,$2::jsonb,NOW())
       ON CONFLICT(key) DO UPDATE
       SET value=EXCLUDED.value, updated_at=NOW()`,
      ["always_show_brilliant_move", JSON.stringify(enabled)]
    );

    io.emit("app-settings", { alwaysShowBrilliantMove: enabled });
    res.json({ success: true, alwaysShowBrilliantMove: enabled });
  } catch (error) {
    console.error("Brilliant Move setting error:", error.message);
    res.status(500).json({ error: "Could not save setting." });
  }
});

app.get("/api/event", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key=$1",
      ["raining_tacos_event"]
    );
    const value = result.rows[0]?.value || {};
    res.json({ active: value.active === true, event: "raining-tacos" });
  } catch (error) {
    console.error("Event status error:", error.message);
    res.status(500).json({ error: "Could not load event status." });
  }
});

app.post("/api/admin/event", adminAuth, async (req, res) => {
  const active = req.body.active;
  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "active must be true or false." });
  }

  try {
    const value = { active, event: "raining-tacos" };
    await pool.query(
      `INSERT INTO app_settings(key,value,updated_at)
       VALUES($1,$2::jsonb,NOW())
       ON CONFLICT(key) DO UPDATE
       SET value=EXCLUDED.value, updated_at=NOW()`,
      ["raining_tacos_event", JSON.stringify(value)]
    );
    io.emit("event-state", value);
    res.json({ success: true, ...value });
  } catch (error) {
    console.error("Event update error:", error.message);
    res.status(500).json({ error: "Could not update event." });
  }
});

app.post("/api/admin/announcement", adminAuth, (req, res) => {
  const message = String(req.body.message || "").trim();

  if (!message || message.length > 180) {
    return res.status(400).json({ error: "Announcement must be 1–180 characters." });
  }

  const username = req.admin.username;
  const role = username.toLowerCase() === "crislorence"
    ? "OWNER"
    : "ADMIN";

  const announcement = {
    id: crypto.randomUUID(),
    username,
    role,
    verified: true,
    message
  };

  io.emit("global-announcement", announcement);
  res.json({ success: true });
});

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    isAdmin: u.is_admin === true,
    rating: u.rating,
    highestRating: u.highest_rating,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    diamonds: u.diamonds ?? 0,
    avatar: u.avatar_key || "avatar_knight",
    board: u.board_key || "classic"
  };
}


app.post("/api/register", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) {
    return res.status(400).json({
      error: "Username must be 3–18 letters, numbers, or underscores."
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters."
    });
  }

  try {
    const result = await pool.query(
      "INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING *",
      [username, bcrypt.hashSync(password, 10)]
    );

    const u = result.rows[0];
    res.json({ token: tokenFor(u), user: publicUser(u) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "That username is already taken." });
    }
    console.error("Registration error:", error.message);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username=$1",
      [String(req.body.username || "").trim()]
    );

    const u = result.rows[0];

    if (!u || !bcrypt.compareSync(
      String(req.body.password || ""),
      u.password_hash
    )) {
      return res.status(401).json({
        error: "Incorrect username or password."
      });
    }

    res.json({ token: tokenFor(u), user: publicUser(u) });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Login failed." });
  }
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE id=$1",
      [req.user.id]
    );

    const u = result.rows[0];

    if (!u) {
      return res.status(404).json({ error: "Account not found." });
    }

    res.json({ user: publicUser(u) });
  } catch (error) {
    console.error("Profile error:", error.message);
    res.status(500).json({ error: "Could not load profile." });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT username,rating,wins,losses,draws FROM users ORDER BY rating DESC,wins DESC LIMIT 50"
    );

    res.json({ players: result.rows });
  } catch (error) {
    console.error("Leaderboard error:", error.message);
    res.status(500).json({ error: "Could not load leaderboard." });
  }
});

app.get("/api/history", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, w.username AS white_name, b.username AS black_name
      FROM matches m
      LEFT JOIN users w ON w.id=m.white_id
      LEFT JOIN users b ON b.id=m.black_id
      WHERE m.white_id=$1 OR m.black_id=$1
      ORDER BY m.id DESC LIMIT 30
    `, [req.user.id]);

    res.json({ matches: result.rows });
  } catch (error) {
    console.error("History error:", error.message);
    res.status(500).json({ error: "Could not load match history." });
  }
});



app.post("/api/admin/tournament/reward", adminAuth, async (req,res) => {
  const username=String(req.body.username||"").trim(), key=String(req.body.key||"");
  const item=COSMETICS[key];
  if (!item?.reward) return res.status(400).json({error:"Choose a tournament reward cosmetic."});
  try {
    const u=await pool.query("SELECT id FROM users WHERE LOWER(username)=LOWER($1)",[username]);
    if (!u.rows[0]) return res.status(404).json({error:"Player not found."});
    await pool.query("INSERT INTO cosmetic_purchases(user_id,cosmetic_key) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.rows[0].id,key]);
    res.json({success:true,username,key});
  } catch(e) { res.status(500).json({error:"Could not grant reward."}); }
});

// ---------------------------------------------------------------------------
// Diamonds & cosmetics. All balances and purchases are changed server-side.

app.post("/api/admin/economy/verify-topup", adminAuth, async (req,res) => {
  const reference=String(req.body.reference||"").trim();
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const pending=await client.query("SELECT * FROM topup_requests WHERE reference=$1 FOR UPDATE",[reference]);
    const row=pending.rows[0];
    if (!row) throw new Error("Top-up request not found.");
    if (row.status !== "pending") throw new Error("Top-up request is already processed.");
    await client.query("UPDATE topup_requests SET status='paid' WHERE id=$1",[row.id]);
    await client.query("UPDATE users SET diamonds=diamonds+$1 WHERE id=$2",[row.diamonds,row.user_id]);
    await client.query("INSERT INTO diamond_ledger(user_id,amount,reason,reference) VALUES($1,$2,'Verified ₱10 top-up',$3)",[row.user_id,row.diamonds,reference]);
    const balance=await client.query("SELECT diamonds FROM users WHERE id=$1",[row.user_id]);
    await client.query("COMMIT");
    res.json({success:true,reference,diamondsAdded:row.diamonds,balance:balance.rows[0].diamonds});
  } catch(e) { await client.query("ROLLBACK"); res.status(400).json({error:e.message}); }
  finally { client.release(); }
});

const COSMETICS = {
  board_christmas: {
    type: "board",
    name: "Christmas Emerald",
    price: 0,
    event: true,
    description: "Limited Christmas Event board with green marble and festive effects.",
    features: ["Free event board", "Snowfall", "Festive checkmate burst"]
  },
  board_sapphire: {
    type: "board",
    name: "Royal Sapphire",
    price: 20,
    premium: true,
    deal: true,
    description: "Blue sapphire marble with a gold frame and royal checkmate effects.",
    features: ["King Circle", "Lightning Strike", "Checkmate effect"]
  },
  board_obsidian: { type: "board", name: "Obsidian Royale", price: 15, premium: true, exclusive: true, description: "A refined black-marble and gold chessboard with a crowned king highlight and lightning-strike checkmate finale." },
  board_aurora: { type: "board", name: "Aurora", price: 10, description: "Cool teal and violet board." },
  board_rose: { type: "board", name: "Rosewood", price: 8, description: "Warm rosewood and cream." },
  board_forest: { type: "board", name: "Forest", price: 8, description: "Emerald green tournament board." },
  avatar_crown: { type: "avatar", name: "Royal Crown", price: 6, description: "A golden crown profile emblem." },
  avatar_dragon: { type: "avatar", name: "Dragon", price: 8, description: "A dragon profile emblem." },
  avatar_phoenix: { type: "avatar", name: "Phoenix", price: 8, description: "A phoenix profile emblem." },
  avatar_knight: { type: "avatar", name: "Knight", price: 0, description: "Default ChessMate avatar." },
  avatar_tournament_laurel: { type: "avatar", name: "Tournament Laurel", price: -1, reward: true, description: "Tournament-only profile reward." },
  board_tournament_slate: { type: "board", name: "Slate Arena", price: -1, reward: true, description: "A modest tournament reward board." }
};
function profilePayload(row) {
  return { diamonds: row.diamonds, avatar: row.avatar_key, board: row.board_key };
}
app.get("/api/economy/catalog", (req, res) => {
  res.json({ topup: { php: 10, diamonds: 2 }, cosmetics: Object.entries(COSMETICS).map(([key, item]) => ({ key, ...item })) });
});
app.get("/api/economy/me", auth, async (req, res) => {
  try {
    const [u, owned] = await Promise.all([
      pool.query("SELECT diamonds,avatar_key,board_key,is_admin FROM users WHERE id=$1", [req.user.id]),
      pool.query("SELECT cosmetic_key FROM cosmetic_purchases WHERE user_id=$1", [req.user.id])
    ]);
    if (!u.rows[0]) return res.status(404).json({ error: "Account not found." });
    res.json({ ...profilePayload(u.rows[0]), isAdmin: u.rows[0].is_admin === true, owned: owned.rows.map(x => x.cosmetic_key) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not load wallet." }); }
});
app.get("/api/economy/ledger", auth, async (req,res) => {
  try {
    const r=await pool.query("SELECT amount,reason,created_at FROM diamond_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 50",[req.user.id]);
    res.json({transactions:r.rows});
  } catch(e) { res.status(500).json({error:"Could not load Diamond history."}); }
});
// Creates a pending payment intent only. Diamonds are NOT granted until a verified payment webhook/admin confirmation exists.
app.post("/api/economy/topup", auth, async (req, res) => {
  const reference = "CM-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  try {
    await pool.query(
      "INSERT INTO topup_requests(user_id,php_amount,diamonds,reference) VALUES($1,10,2,$2)",
      [req.user.id, reference]
    );
    res.status(202).json({ status: "pending", reference, php: 10, diamonds: 2, message: "Payment request created. Diamonds will be credited only after payment is verified." });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not create top-up request." }); }
});
app.post("/api/economy/purchase", auth, async (req, res) => {
  const key = String(req.body.key || "");
  const item = COSMETICS[key];
  if (!item || item.reward === true || item.price < 0) return res.status(400).json({ error: "This cosmetic is not available for direct purchase." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ur = await client.query("SELECT diamonds FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
    if (!ur.rows[0]) throw new Error("Account not found.");
    const already = await client.query("SELECT 1 FROM cosmetic_purchases WHERE user_id=$1 AND cosmetic_key=$2", [req.user.id,key]);
    if (already.rowCount) throw new Error("You already own this cosmetic.");
    const adminResult = await client.query("SELECT is_admin FROM users WHERE id=$1", [req.user.id]);
    const adminFree = item.reward !== true && item.price >= 0 && adminResult.rows[0]?.is_admin === true;
    if (!adminFree && ur.rows[0].diamonds < item.price) throw new Error("Not enough Diamonds.");
    if (!adminFree && item.price > 0) {
      await client.query("UPDATE users SET diamonds=diamonds-$1 WHERE id=$2", [item.price,req.user.id]);
      await client.query("INSERT INTO diamond_ledger(user_id,amount,reason) VALUES($1,$2,$3)", [req.user.id,-item.price,`Cosmetic purchase: ${item.name}`]);
    }
    await client.query("INSERT INTO cosmetic_purchases(user_id,cosmetic_key) VALUES($1,$2)", [req.user.id,key]);
    if (item.type === "avatar") await client.query("UPDATE users SET avatar_key=$1 WHERE id=$2", [key,req.user.id]);
    if (item.type === "board") await client.query("UPDATE users SET board_key=$1 WHERE id=$2", [key,req.user.id]);
    const balance = await client.query("SELECT diamonds,avatar_key,board_key FROM users WHERE id=$1", [req.user.id]);
    await client.query("COMMIT");
    res.json({ success:true, ...profilePayload(balance.rows[0]), purchased:key });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message || "Purchase failed." });
  } finally { client.release(); }
});
app.post("/api/economy/equip", auth, async (req, res) => {
  const key = String(req.body.key || ""), item = COSMETICS[key];
  if (!item) return res.status(400).json({ error: "Unknown cosmetic." });
  try {
    const own = item.price === 0 ? true : (await pool.query("SELECT 1 FROM cosmetic_purchases WHERE user_id=$1 AND cosmetic_key=$2", [req.user.id,key])).rowCount > 0;
    if (!own) return res.status(403).json({ error: "Purchase this cosmetic first." });
    const column = item.type === "avatar" ? "avatar_key" : "board_key";
    const result = await pool.query(`UPDATE users SET ${column}=$1 WHERE id=$2 RETURNING diamonds,avatar_key,board_key`, [key,req.user.id]);
    res.json({ success:true, ...profilePayload(result.rows[0]) });
  } catch (e) { res.status(500).json({ error: "Could not equip cosmetic." }); }
});
app.get("/api/profile/:username", async (req,res) => {
  try {
    const r = await pool.query("SELECT username,rating,wins,losses,draws,avatar_key,board_key FROM users WHERE LOWER(username)=LOWER($1)", [req.params.username]);
    if (!r.rows[0]) return res.status(404).json({ error:"Player not found." });
    res.json({ profile:r.rows[0] });
  } catch(e) { res.status(500).json({ error:"Could not load profile." }); }
});

// Clan system: independent records and leaderboard, separate from tournament standings.
app.post("/api/clans", auth, async (req,res) => {
  const name = String(req.body.name || "").trim();
  if (!/^[A-Za-z0-9 _-]{3,24}$/.test(name)) return res.status(400).json({error:"Clan name must be 3–24 letters, numbers, spaces, _ or -."});
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if ((await c.query("SELECT 1 FROM clan_members WHERE user_id=$1",[req.user.id])).rowCount) throw new Error("Leave your current clan before creating another.");
    const clan = await c.query("INSERT INTO clans(name,invite_code,leader_id) VALUES($1,$2,$3) RETURNING id,name,invite_code,leader_id,wins,losses",[name,code,req.user.id]);
    await c.query("INSERT INTO clan_members(clan_id,user_id) VALUES($1,$2)",[clan.rows[0].id,req.user.id]);
    await c.query("COMMIT"); res.json({clan:clan.rows[0]});
  } catch(e) { await c.query("ROLLBACK"); res.status(400).json({error:e.code==="23505"?"Clan name already exists.":e.message}); }
  finally { c.release(); }
});
app.post("/api/clans/join", auth, async (req,res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if ((await c.query("SELECT 1 FROM clan_members WHERE user_id=$1",[req.user.id])).rowCount) throw new Error("You are already in a clan.");
    const clan = await c.query("SELECT * FROM clans WHERE invite_code=$1",[code]);
    if (!clan.rows[0]) throw new Error("Invite code not found.");
    const count = await c.query("SELECT COUNT(*)::int AS n FROM clan_members WHERE clan_id=$1",[clan.rows[0].id]);
    if (count.rows[0].n >= 5) throw new Error("This clan is full (5 players maximum).");
    await c.query("INSERT INTO clan_members(clan_id,user_id) VALUES($1,$2)",[clan.rows[0].id,req.user.id]);
    await c.query("COMMIT"); res.json({success:true,clan:clan.rows[0]});
  } catch(e) { await c.query("ROLLBACK"); res.status(400).json({error:e.message}); }
  finally { c.release(); }
});
app.get("/api/clans/me", auth, async (req,res) => {
  try {
    const r = await pool.query(`
      SELECT c.id,c.name,c.invite_code,c.leader_id,c.wins,c.losses,
        u.username,u.rating
      FROM clan_members mine JOIN clans c ON c.id=mine.clan_id
      JOIN clan_members allm ON allm.clan_id=c.id JOIN users u ON u.id=allm.user_id
      WHERE mine.user_id=$1 ORDER BY u.rating DESC,u.username
    `,[req.user.id]);
    if (!r.rows.length) return res.json({clan:null});
    const c=r.rows[0], matches=Number(c.wins)+Number(c.losses);
    res.json({clan:{id:c.id,name:c.name,inviteCode:c.invite_code,leaderId:c.leader_id,wins:c.wins,losses:c.losses,winRate:matches?Math.round(c.wins/matches*1000)/10:0,members:r.rows.map(x=>({username:x.username,rating:x.rating}))}});
  } catch(e) { res.status(500).json({error:"Could not load clan."}); }
});
app.get("/api/clans/leaderboard", async (req,res) => {
  try {
    const r=await pool.query(`SELECT c.id,c.name,c.wins,c.losses,COUNT(cm.user_id)::int AS members,
      CASE WHEN c.wins+c.losses=0 THEN 0 ELSE ROUND(c.wins::numeric/(c.wins+c.losses)*100,1) END AS win_rate
      FROM clans c LEFT JOIN clan_members cm ON cm.clan_id=c.id
      GROUP BY c.id ORDER BY c.wins DESC,win_rate DESC,c.losses ASC,c.name ASC LIMIT 100`);
    res.json({clans:r.rows});
  } catch(e) { res.status(500).json({error:"Could not load Clan leaderboard."}); }
});

// Tournament: six-clan single-elimination championship; team boards are seeded highest ELO vs highest ELO.
async function clanRoster(clanId) {
  const r=await pool.query(`SELECT u.id,u.username,u.rating FROM clan_members cm JOIN users u ON u.id=cm.user_id WHERE cm.clan_id=$1 ORDER BY u.rating DESC,u.username ASC`,[clanId]);
  return r.rows;
}
async function tournamentRoster(clanId, season) {
  const r=await pool.query(`SELECT u.id,u.username,tep.rating_at_registration AS rating
    FROM tournament_entries te JOIN tournament_entry_players tep ON tep.entry_id=te.id
    JOIN users u ON u.id=tep.user_id WHERE te.clan_id=$1 AND te.season=$2
    ORDER BY tep.rating_at_registration DESC,u.username ASC`,[clanId,season]);
  return r.rows;
}
async function makeSixClanBracket(season, includedClanId) {
  const db=await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",[season]);
    const exists=await db.query("SELECT 1 FROM tournament_matches WHERE season=$1 LIMIT 1",[season]);
    if (exists.rowCount) { await db.query("COMMIT"); return; }
    const others=await db.query("SELECT te.clan_id AS id,c.name FROM tournament_entries te JOIN clans c ON c.id=te.clan_id WHERE te.season=$1 AND te.clan_id<>$2 ORDER BY random() LIMIT 5",[season,includedClanId]);
    if (others.rowCount < 5) { await db.query("COMMIT"); return; }
    const included=await db.query("SELECT id,name FROM clans WHERE id=$1",[includedClanId]);
    const teams=[...others.rows,included.rows[0]];
    for(let i=teams.length-1;i>0;i--){const j=crypto.randomInt(i+1);[teams[i],teams[j]]=[teams[j],teams[i]];}
    const byes=teams.slice(0,2), opening=teams.slice(2);
    const q1=await db.query("INSERT INTO tournament_matches(season,round,match_number,clan_a_id,clan_b_id) VALUES($1,1,1,$2,$3) RETURNING id",[season,opening[0].id,opening[1].id]);
    const q2=await db.query("INSERT INTO tournament_matches(season,round,match_number,clan_a_id,clan_b_id) VALUES($1,1,2,$2,$3) RETURNING id",[season,opening[2].id,opening[3].id]);
    const s1=await db.query("INSERT INTO tournament_matches(season,round,match_number,clan_a_id) VALUES($1,2,1,$2) RETURNING id",[season,byes[0].id]);
    const s2=await db.query("INSERT INTO tournament_matches(season,round,match_number,clan_a_id) VALUES($1,2,2,$2) RETURNING id",[season,byes[1].id]);
    const f=await db.query("INSERT INTO tournament_matches(season,round,match_number) VALUES($1,3,1) RETURNING id",[season]);
    await db.query("UPDATE tournament_matches SET next_match_id=$1,next_slot='B' WHERE id=$2",[s1.rows[0].id,q1.rows[0].id]);
    await db.query("UPDATE tournament_matches SET next_match_id=$1,next_slot='B' WHERE id=$2",[s2.rows[0].id,q2.rows[0].id]);
    await db.query("UPDATE tournament_matches SET next_match_id=$1,next_slot='A' WHERE id=$2",[f.rows[0].id,s1.rows[0].id]);
    await db.query("UPDATE tournament_matches SET next_match_id=$1,next_slot='B' WHERE id=$2",[f.rows[0].id,s2.rows[0].id]);
    await db.query("COMMIT");
  } catch(e) { await db.query("ROLLBACK"); throw e; }
  finally { db.release(); }
}
app.post("/api/tournament/register", auth, async (req,res) => {
  const season="open-season-1";
  try {
    const c=await pool.query("SELECT c.id,c.name FROM clan_members cm JOIN clans c ON c.id=cm.clan_id WHERE cm.user_id=$1",[req.user.id]);
    if (!c.rows[0]) return res.status(400).json({error:"Join or create a clan in the separate Clan section first."});
    const roster=await clanRoster(c.rows[0].id);
    if (roster.length<3 || roster.length>5) return res.status(400).json({error:"Tournament clans must register 3–5 players."});
    const alreadyRegistered=await pool.query("SELECT id FROM tournament_entries WHERE clan_id=$1 AND season=$2",[c.rows[0].id,season]);
    const registeredBefore=await pool.query("SELECT COUNT(*)::int AS n FROM tournament_entries WHERE season=$1",[season]);
    if (!alreadyRegistered.rowCount && registeredBefore.rows[0].n>=6) return res.status(409).json({error:"The six-Clan championship roster is already locked for this season."});
    let entry=await pool.query("INSERT INTO tournament_entries(clan_id,season) VALUES($1,$2) ON CONFLICT(clan_id,season) DO NOTHING RETURNING id",[c.rows[0].id,season]);
    let entryId=entry.rows[0]?.id;
    if (!entryId) entryId=(await pool.query("SELECT id FROM tournament_entries WHERE clan_id=$1 AND season=$2",[c.rows[0].id,season])).rows[0]?.id;
    const snapshotCount=await pool.query("SELECT COUNT(*)::int AS n FROM tournament_entry_players WHERE entry_id=$1",[entryId]);
    if (snapshotCount.rows[0].n===0) {
      await pool.query(`INSERT INTO tournament_entry_players(entry_id,user_id,rating_at_registration)
        SELECT $1,u.id,u.rating FROM clan_members cm JOIN users u ON u.id=cm.user_id
        WHERE cm.clan_id=$2 ON CONFLICT(entry_id,user_id) DO NOTHING`,[entryId,c.rows[0].id]);
    }
    const registeredRoster=await tournamentRoster(c.rows[0].id,season);
    if (registeredRoster.length<3 || registeredRoster.length>5) return res.status(400).json({error:"The registered tournament roster must contain 3–5 players."});
    const count=await pool.query("SELECT COUNT(*)::int AS n FROM tournament_entries WHERE season=$1",[season]);
    if (count.rows[0].n>=6) await makeSixClanBracket(season,c.rows[0].id);
    res.json({success:true,clan:c.rows[0],roster:registeredRoster.map(x=>({username:x.username,rating:x.rating})),registeredClans:count.rows[0].n,format:"Six-clan championship. Two opening matches, two semifinal byes, then the championship. In each clan match, highest ELO faces highest ELO, descending."});
  } catch(e) { console.error("Tournament registration:",e); res.status(500).json({error:"Could not register clan."}); }
});
app.get("/api/tournament/entries", async (req,res) => {
  try {
    const season="open-season-1";
    const r=await pool.query(`SELECT c.id,c.name,COALESCE(json_agg(json_build_object('username',u.username,'rating',tep.rating_at_registration) ORDER BY tep.rating_at_registration DESC) FILTER (WHERE u.id IS NOT NULL),'[]'::json) AS roster
      FROM tournament_entries te JOIN clans c ON c.id=te.clan_id LEFT JOIN tournament_entry_players tep ON tep.entry_id=te.id LEFT JOIN users u ON u.id=tep.user_id
      WHERE te.season=$1 GROUP BY c.id,c.name ORDER BY c.name`,[season]);
    const m=await pool.query(`SELECT tm.id,tm.round,tm.match_number,tm.status,tm.winner_clan_id,
      a.id AS a_id,a.name AS clan_a,b.id AS b_id,b.name AS clan_b,w.name AS winner
      FROM tournament_matches tm LEFT JOIN clans a ON a.id=tm.clan_a_id LEFT JOIN clans b ON b.id=tm.clan_b_id LEFT JOIN clans w ON w.id=tm.winner_clan_id
      WHERE tm.season=$1 ORDER BY tm.round,tm.match_number`,[season]);
    const matches=[];
    for(const x of m.rows){
      const ra=x.a_id?await tournamentRoster(x.a_id,season):[], rb=x.b_id?await tournamentRoster(x.b_id,season):[];
      const boards=[]; for(let i=0;i<Math.min(ra.length,rb.length);i++) boards.push({rank:i+1,playerA:ra[i].username,eloA:ra[i].rating,playerB:rb[i].username,eloB:rb[i].rating});
      matches.push({id:x.id,round:x.round,matchNumber:x.match_number,status:x.status,clanA:x.clan_a,clanB:x.clan_b,winner:x.winner,boards});
    }
    res.json({entries:r.rows,matches,registeredCount:r.rowCount,required:6,champion:matches.find(x=>x.round===3&&x.status==="complete")?.winner||null,format:"Six-clan single-elimination championship. Each clan's players are paired highest ELO vs highest ELO, then descending."});
  } catch(e) { console.error(e); res.status(500).json({error:"Could not load tournament bracket."}); }
});
app.post("/api/admin/tournament/result", adminAuth, async (req,res) => {
  const matchId=Number(req.body.matchId), winnerId=Number(req.body.winnerClanId);
  if(!Number.isSafeInteger(matchId)||!Number.isSafeInteger(winnerId)) return res.status(400).json({error:"A match and winning clan are required."});
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    const r=await c.query("SELECT * FROM tournament_matches WHERE id=$1 FOR UPDATE",[matchId]);
    const match=r.rows[0];
    if(!match||match.status!=="pending"||![Number(match.clan_a_id),Number(match.clan_b_id)].includes(winnerId)) throw new Error("Invalid or already completed tournament match.");
    const loserId=Number(match.clan_a_id)===winnerId?match.clan_b_id:match.clan_a_id;
    await c.query("UPDATE tournament_matches SET winner_clan_id=$1,status='complete' WHERE id=$2",[winnerId,matchId]);
    await c.query("UPDATE clans SET wins=wins+1 WHERE id=$1",[winnerId]);
    if(loserId) await c.query("UPDATE clans SET losses=losses+1 WHERE id=$1",[loserId]);
    if(match.next_match_id && match.next_slot){
      await c.query(`UPDATE tournament_matches SET ${match.next_slot==='A'?'clan_a_id':'clan_b_id'}=$1 WHERE id=$2`,[winnerId,match.next_match_id]);
    }
    if(Number(match.round)===3){
      await c.query("INSERT INTO cosmetic_purchases(user_id,cosmetic_key) SELECT cm.user_id,v.cosmetic_key FROM clan_members cm CROSS JOIN (VALUES('avatar_tournament_laurel'),('board_tournament_slate')) AS v(cosmetic_key) WHERE cm.clan_id=$1 ON CONFLICT DO NOTHING",[winnerId]);
    }
    await c.query("COMMIT"); res.json({success:true,winnerClanId:winnerId,championRewardsGranted:Number(match.round)===3});
  } catch(e){await c.query("ROLLBACK");res.status(400).json({error:e.message});}
  finally{c.release();}
});

const waiting = [];
const rooms = new Map();
const socketUsers = new Map();
const RECONNECT_GRACE_MS = 45000;

function getUser(socket) {
  return socketUsers.get(socket.id);
}

function eloDelta(a, b, scoreA, K = 24) {
  const expected = 1 / (1 + Math.pow(10, (b - a) / 400));
  return Math.round(K * (scoreA - expected));
}

function makeCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function newRoom(code, extra = {}) {
  return {
    code,
    players: [],
    moves: [],
    chess: new Chess(),
    started: false,
    finished: false,
    ...extra
  };
}

function playerOf(room, socketId) {
  return room.players.find(p => p.id === socketId);
}

function sharedBoardTheme(room) {
  return room.players.some(p =>
    p.user?.isAdmin === true && p.user?.boardKey === "board_obsidian"
  ) ? "board_obsidian" : null;
}

function playersPayload(room) {
  return room.players.map(p => ({
    username: p.user.username,
    rating: p.user.rating,
    color: p.color
  }));
}

function syncPayload(room) {
  return {
    code: room.code,
    fen: room.chess.fen(),
    moves: room.moves,
    ranked: !!room.ranked,
    players: playersPayload(room),
    boardTheme: sharedBoardTheme(room)
  };
}

function resultOfPosition(chess) {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === "w" ? "black" : "white", reason: "checkmate" };
  }
  if (chess.isStalemate()) return { result: "draw", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { result: "draw", reason: "insufficient material" };
  if (chess.isThreefoldRepetition()) return { result: "draw", reason: "threefold repetition" };
  if (chess.isDraw()) return { result: "draw", reason: "50-move rule" };
  return null;
}

// Stores the result, updates ELO for ranked games and tells everybody in the room.

async function finishRoom(room, result, reason) {
  if (room.finished || room.players.length < 2) return;

  const white = room.players.find(p => p.color === "white");
  const black = room.players.find(p => p.color === "black");
  if (!white || !black) return;

  room.finished = true;

  let dw = 0;
  let dbb = 0;
  let freshW;
  let freshB;

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const wResult = await client.query(
      "SELECT * FROM users WHERE id=$1 FOR UPDATE",
      [white.user.id]
    );
    const bResult = await client.query(
      "SELECT * FROM users WHERE id=$1 FOR UPDATE",
      [black.user.id]
    );

    const wu = wResult.rows[0];
    const bu = bResult.rows[0];

    if (!wu || !bu) {
      await client.query("ROLLBACK");
      room.finished = false;
      return;
    }

    if (room.ranked) {
      const score = result === "draw" ? 0.5 : result === "white" ? 1 : 0;
      dw = eloDelta(wu.rating, bu.rating, score);
      dbb = eloDelta(bu.rating, wu.rating, 1 - score);

      const updatedW = await client.query(`
        UPDATE users
        SET rating=GREATEST(0,rating+$1),
            highest_rating=GREATEST(highest_rating,GREATEST(0,rating+$1)),
            wins=wins+$2,
            losses=losses+$3,
            draws=draws+$4
        WHERE id=$5
        RETURNING *
      `, [
        dw,
        result === "white" ? 1 : 0,
        result === "black" ? 1 : 0,
        result === "draw" ? 1 : 0,
        wu.id
      ]);

      const updatedB = await client.query(`
        UPDATE users
        SET rating=GREATEST(0,rating+$1),
            highest_rating=GREATEST(highest_rating,GREATEST(0,rating+$1)),
            wins=wins+$2,
            losses=losses+$3,
            draws=draws+$4
        WHERE id=$5
        RETURNING *
      `, [
        dbb,
        result === "black" ? 1 : 0,
        result === "white" ? 1 : 0,
        result === "draw" ? 1 : 0,
        bu.id
      ]);

      freshW = updatedW.rows[0];
      freshB = updatedB.rows[0];
    } else {
      freshW = wu;
      freshB = bu;
    }

    await client.query(`
      INSERT INTO matches(
        white_id,black_id,result,mode,
        white_rating_change,black_rating_change
      ) VALUES($1,$2,$3,$4,$5,$6)
    `, [
      wu.id,
      bu.id,
      result,
      room.ranked ? "ranked" : "friends",
      dw,
      dbb
    ]);

    await client.query("COMMIT");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    room.finished = false;
    console.error("Game result database error:", error.message);
    return;
  } finally {
    if (client) client.release();
  }

  const publicW = publicUser(freshW);
  const publicB = publicUser(freshB);
  const changes = { white: dw, black: dbb };

  io.to(room.code).emit("game-over", {
    code: room.code, result, reason, ranked: !!room.ranked,
    white: publicW, black: publicB, changes
  });

  if (room.ranked) {
    io.to(room.code).emit("ranked-result", {
      result, white: publicW, black: publicB, changes
    });
  }

  for (const p of room.players) {
    const socket = socketUsers.get(p.id);
    if (socket) {
      socketUsers.set(p.id, p.color === "white" ? publicW : publicB);
    }
  }
}

function resign(room, loserSocketId) {
  const loser = playerOf(room, loserSocketId);
  if (!loser || !room.started || room.finished) return;
  finishRoom(room, loser.color === "white" ? "black" : "white", "resignation");
}

function removePlayer(room, player) {
  room.players = room.players.filter(p => p !== player);
  clearTimeout(player.dropTimer);
  if (!room.players.length) rooms.delete(room.code);
}

io.on("connection", socket => {
  socket.on("authenticate", async (token, callback) => {
    const reply = data => {
      if (typeof callback === "function") callback(data);
    };

    try {
      if (typeof token !== "string" || !token) {
        socketUsers.delete(socket.id);
        reply({ ok: false, error: "Please log in again." });
        return;
      }

      const payload = jwt.verify(token, SECRET);
      const result = await pool.query(
        "SELECT * FROM users WHERE id=$1",
        [payload.id]
      );
      const u = result.rows[0];

      if (!u) {
        socketUsers.delete(socket.id);
        reply({ ok: false, error: "Account not found. Please log in again." });
        return;
      }

      const safeUser = publicUser(u);
      socketUsers.set(socket.id, {
        ...safeUser,
        isAdmin: u.is_admin === true,
        boardKey: u.board_key || "classic"
      });
      reply({ ok: true, user: safeUser });

      // Resume a game that was interrupted by a dropped connection.
      for (const room of rooms.values()) {
        if (!room.started || room.finished) continue;
        const p = room.players.find(x => x.user.id === u.id);
        if (!p) continue;
        clearTimeout(p.dropTimer);
        p.id = socket.id;
        p.user = socketUsers.get(socket.id);
        p.offline = false;
        socket.join(room.code);
        socket.emit("room-resume", { ...syncPayload(room), color: p.color });
        socket.to(room.code).emit("opponent-back");
      }
    } catch (error) {
      socketUsers.delete(socket.id);
      console.error("Socket authentication error:", error.message);
      reply({ ok: false, error: "Socket authentication failed. Please log in again." });
    }
  });

  socket.on("create-room", () => {
    const u = getUser(socket);
    if (!u) return socket.emit("notice", "Log in first to create a room.");

    let code = makeCode();
    while (rooms.has(code)) code = makeCode();

    const room = newRoom(code);
    room.players.push({ id: socket.id, user: u, color: "white" });
    rooms.set(code, room);

    socket.join(code);
    socket.emit("room-created", { code, color: "white" });
  });

  socket.on("join-room", code => {
    const u = getUser(socket);
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);

    if (!u) return socket.emit("notice", "Log in first to join a room.");
    if (!room) return socket.emit("notice", "Room not found.");
    if (room.players.length >= 2) return socket.emit("notice", "Room is full.");
    if (room.players.some(p => p.user.id === u.id)) {
      return socket.emit("notice", "You cannot join your own room from the same account.");
    }

    room.players.push({ id: socket.id, user: u, color: "black" });
    socket.join(code);
    room.started = true;

    io.to(code).emit("room-ready", {
      code,
      players: playersPayload(room),
      boardTheme: sharedBoardTheme(room)
    });
  });

  socket.on("room-move", data => {
    const room = rooms.get(String(data?.code || "").toUpperCase());
    const p = room && playerOf(room, socket.id);
    if (!room || !p || !room.started || room.finished) return;

    const mv = data.move || {};
    if (room.chess.turn() !== p.color[0]) {
      return socket.emit("move-rejected", syncPayload(room));
    }

    let made;
    try {
      made = room.chess.move({
        from: String(mv.from || ""),
        to: String(mv.to || ""),
        promotion: mv.promotion ? String(mv.promotion) : undefined
      });
    } catch {
      return socket.emit("move-rejected", syncPayload(room));
    }

    const move = { from: made.from, to: made.to, promotion: made.promotion };
    room.moves.push(move);
    socket.to(room.code).emit("opponent-move", { ...move, san: made.san });

    const end = resultOfPosition(room.chess);
    if (end) finishRoom(room, end.result, end.reason);
  });

  socket.on("resign", code => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (room) resign(room, socket.id);
  });

  socket.on("leave-room", code => {
    const room = rooms.get(String(code || "").toUpperCase());
    const p = room && playerOf(room, socket.id);
    if (!room || !p) return;

    // Leaving an unfinished ranked game counts as a resignation.
    if (room.ranked && room.started && !room.finished) resign(room, socket.id);

    socket.leave(room.code);
    removePlayer(room, p);
    if (room.players.length) io.to(room.code).emit("opponent-left");
  });

  socket.on("ranked-queue", () => {
    const u = getUser(socket);
    if (!u) return socket.emit("notice", "Log in first to play ranked.");
    // Remove queue entries whose sockets have already disconnected.
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (!io.sockets.sockets.has(waiting[i].id)) waiting.splice(i, 1);
    }

    if (waiting.some(x => x.id === socket.id || x.user.id === u.id)) return;

    const idx = waiting.findIndex(
      x => x.user.id !== u.id && Math.abs(x.user.rating - u.rating) <= 300
    );

    if (idx < 0) {
      waiting.push({ id: socket.id, user: u });
      socket.emit("queue-status", "Searching for an opponent…");
      return;
    }

    const opponent = waiting.splice(idx, 1)[0];
    const code = "R" + makeCode();

    const room = newRoom(code, { started: true, ranked: true });
    room.players.push(
      { id: opponent.id, user: opponent.user, color: "white" },
      { id: socket.id, user: u, color: "black" }
    );
    rooms.set(code, room);

    io.sockets.sockets.get(opponent.id)?.join(code);
    socket.join(code);

    io.to(code).emit("ranked-matched", {
      code,
      players: playersPayload(room),
      boardTheme: sharedBoardTheme(room)
    });
  });

  socket.on("cancel-queue", () => {
    const i = waiting.findIndex(x => x.id === socket.id);
    if (i >= 0) waiting.splice(i, 1);
  });

  // Kept for older clients: results are decided by the server now, so the only
  // claim accepted here is the sender's own defeat (a resignation).
  socket.on("ranked-finish", data => {
    const room = rooms.get(String(data?.code || ""));
    const p = room && playerOf(room, socket.id);
    if (!room || !room.ranked || !p) return;
    const loserResult = p.color === "white" ? "black" : "white";
    if (data.result === loserResult) resign(room, socket.id);
  });

  socket.on("disconnect", () => {
    const i = waiting.findIndex(x => x.id === socket.id);
    if (i >= 0) waiting.splice(i, 1);

    socketUsers.delete(socket.id);

    for (const room of [...rooms.values()]) {
      const p = playerOf(room, socket.id);
      if (!p) continue;

      if (!room.started || room.finished) {
        removePlayer(room, p);
        if (room.players.length) io.to(room.code).emit("opponent-left");
        continue;
      }

      // Active game: keep the seat for a short grace period so the player can reconnect.
      p.offline = true;
      io.to(room.code).emit("opponent-left");
      p.dropTimer = setTimeout(() => {
        if (!p.offline || room.finished) return;
        if (room.ranked) finishRoom(room, p.color === "white" ? "black" : "white", "abandonment");
        removePlayer(room, p);
      }, RECONNECT_GRACE_MS);
    }
  });
});

initDb()
  .then(() => initAdminSettings())
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`ChessMate PostgreSQL server listening on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("PostgreSQL initialization failed:", error.message);
    process.exit(1);
  });
