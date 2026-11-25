import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "public", "update.json");
const description = process.argv.slice(2).join(" ").trim() ||
  "ChessMate improvements and new features";

const now = new Date();
const release = new Date(now.getTime() + 10 * 60 * 1000);
const date = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila"
}).format(release);

const config = {
  enabled: true,
  scheduledAt: release.toISOString(),
  date: `${date} (Philippines time)`,
  title: "ChessMate Scheduled Update",
  description: description.split("|").map(x => x.trim()).filter(Boolean),
  version: `chessmate-${release.getTime()}`
};

fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log("Scheduled ChessMate update for:", config.date);
console.log("Countdown: 10 minutes from now");
console.log("Description:", config.description.join(" • "));
