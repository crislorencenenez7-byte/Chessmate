#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")"

echo "================================"
echo "       CHESSMATE AUTO SHIP"
echo "================================"

# Verify branch
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ]; then
  echo "ERROR: Nasa branch '$BRANCH' ka, hindi main."
  exit 1
fi

# Verify remote
git remote get-url origin >/dev/null

# Update Service Worker and scheduled release version
python3 - <<'PY'
import json
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta

sw = Path("public/sw.js")
config_file = Path("public/update.json")

source = sw.read_text()
match = re.search(r"const CACHE = 'chessmate-shell-v(\d+)';", source)

if not match:
    raise SystemExit("ERROR: Hindi makita ang Service Worker cache version.")

old_version = int(match.group(1))
new_version = old_version + 1

source = source[:match.start(1)] + str(new_version) + source[match.end(1):]
sw.write_text(source)

config = json.loads(config_file.read_text())

release = datetime.now(timezone.utc) + timedelta(minutes=4)

config["enabled"] = True
config["scheduledAt"] = release.isoformat(timespec="milliseconds").replace("+00:00", "Z")
config["date"] = release.astimezone(
    timezone(timedelta(hours=8))
).strftime("%b %d, %Y, %I:%M %p (Philippines time)")
config["version"] = f"chessmate-{int(release.timestamp() * 1000)}"

config_file.write_text(json.dumps(config, indent=2) + "\n")

print(f"Service Worker: v{old_version} -> v{new_version}")
print(f"Release: {config['date']}")
print(f"Update ID: {config['version']}")
PY

# Stage project changes
git add -A

# Block accidental publishing of sensitive files
if git diff --cached --name-only | grep -Ei '(^|/)(\.env($|\.)|.*\.db$|.*\.sqlite3?$|.*backup.*|.*\.bak$|.*\.pem$|.*\.key$|id_rsa)'; then
  echo "ERROR: May sensitive o backup files sa staged changes."
  echo "Walang commit o push na ginawa. Suriin muna ang staged files."
  exit 1
fi

if git diff --cached --quiet; then
  echo "Walang changes na kailangang i-commit."
  exit 0
fi

echo
echo "===== CHANGES TO BE PUSHED ====="
git diff --cached --stat

git commit -m "ChessMate auto update $(date '+%Y-%m-%d %H:%M:%S')"

echo
echo "===== PUSHING TO GITHUB ====="
git push origin main

echo
echo "SUCCESS: ChessMate pushed to GitHub!"
echo "Service Worker cache version: updated"
