import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "public", "update.json");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const description = process.argv.slice(2).join(" ").trim() ||
  "ChessMate improvements and new features";

const now = new Date();
const release = new Date(now.getTime() + 15 * 60 * 1000);
const date = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila"
}).format(release);

const config = {
  enabled: true,
  scheduledAt: release.toISOString(),
  date: `${date} (Philippines time)`,
  title: `ChessMate v${version} Scheduled Update`,
  description: description.split("|").map(x => x.trim()).filter(Boolean),
  version,
  countdownMinutes: 15
};

fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log("Scheduled ChessMate update for:", config.date);
console.log("Countdown: 15 minutes from now");
console.log("Description:", config.description.join(" • "));
