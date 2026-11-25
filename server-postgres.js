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

const { pool, initDb } = require("./db");

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

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    rating: u.rating,
    highestRating: u.highest_rating,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws
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
    players: playersPayload(room)
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
  socket.on("authenticate", async token => {
    try {
      const payload = jwt.verify(token, SECRET);
      const result = await pool.query(
        "SELECT * FROM users WHERE id=$1",
        [payload.id]
      );
      const u = result.rows[0];
      if (!u) return;

      socketUsers.set(socket.id, publicUser(u));

      // Resume a game that was interrupted by a dropped connection.
      for (const room of rooms.values()) {
        if (!room.started || room.finished) continue;
        const p = room.players.find(x => x.user.id === u.id);
        if (!p) continue;
        clearTimeout(p.dropTimer);
        p.id = socket.id;
        p.offline = false;
        socket.join(room.code);
        socket.emit("room-resume", { ...syncPayload(room), color: p.color });
        socket.to(room.code).emit("opponent-back");
      }
    } catch (error) {
      console.error("Socket authentication error:", error.message);
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

    io.to(code).emit("room-ready", { code, players: playersPayload(room) });
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

    io.to(code).emit("ranked-matched", { code, players: playersPayload(room) });
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
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`ChessMate PostgreSQL server listening on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("PostgreSQL initialization failed:", error.message);
    process.exit(1);
  });
