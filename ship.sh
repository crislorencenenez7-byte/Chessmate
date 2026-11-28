#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")"

BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ]; then
  echo "ERROR: Nasa branch $BRANCH, kailangan main."
  exit 1
fi

git remote get-url origin >/dev/null

python3 - <<'PY'
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

sw = Path("public/sw.js")
config_file = Path("public/update.json")
package = json.loads(Path("package.json").read_text())
version = package["version"]

source = sw.read_text()
match = re.search(r"const CACHE = 'chessmate-shell-v(\d+)';", source)
if not match:
    raise SystemExit("ERROR: Hindi makita ang Service Worker cache version.")
old = int(match.group(1))
new = old + 1
source = source[:match.start(1)] + str(new) + source[match.end(1):]
sw.write_text(source)

config = json.loads(config_file.read_text())
release = datetime.now(timezone.utc) + timedelta(minutes=15)
local_release = release.astimezone(timezone(timedelta(hours=8)))
config.update({
    "enabled": True,
    "scheduledAt": release.isoformat().replace("+00:00", "Z"),
    "date": local_release.strftime("%b %d, %Y %I:%M %p") + " (Philippines time)",
    "title": f"ChessMate v{version} Scheduled Update",
    "version": version,
    "countdownMinutes": 15
})
config_file.write_text(json.dumps(config, indent=2) + "\n")

print(f"Service Worker: v{old} -> v{new}")
print("Scheduled banner: enabled")
print("Countdown: 15 minutes from deployment push")
print("Release time:", config["date"])
PY

git add ship.sh README.md db.js server-postgres.js package.json package-lock.json \
  public/app.js public/index.html public/style.css public/pwa.js public/sw.js \
  public/update.json scripts/schedule-update.mjs \
  public/js/admin-royal-fx.js scripts/build-admin-board.mjs \
  public/themes/admin-frame.svg public/themes/admin-panel-left.svg \
  public/themes/admin-panel-right.svg public/themes/admin-royal-board.svg \
  public/themes/board-admin.svg

if git diff --cached --name-only | grep -Ei '(^|/)(\.env($|\.)|.*\.db$|.*\.sqlite3?$|.*backup.*|.*\.bak$|.*\.pem$|.*\.key$|id_rsa)'; then
  echo "ERROR: May sensitive o backup file. Push cancelled."
  exit 1
fi

git diff --cached --check

echo "===== FILES TO PUSH ====="
git diff --cached --name-only
git diff --cached --stat

VERSION="$(node -p "require('./package.json').version")"
git commit -m "Release ChessMate v${VERSION}"
git push origin main

echo "===== GITHUB PUSH COMPLETE ====="
git log -1 --oneline
