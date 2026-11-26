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
from pathlib import Path

sw = Path("public/sw.js")
config_file = Path("public/update.json")

source = sw.read_text()
match = re.search(r"const CACHE = 'chessmate-shell-v(\d+)';", source)

if not match:
    raise SystemExit("ERROR: Hindi makita ang Service Worker cache version.")

old = int(match.group(1))
new = old + 1
source = source[:match.start(1)] + str(new) + source[match.end(1):]
sw.write_text(source)

config = json.loads(config_file.read_text())
config["enabled"] = False
config["scheduledAt"] = None
config_file.write_text(json.dumps(config, indent=2) + "\n")

print(f"Service Worker: v{old} -> v{new}")
print("Scheduled banner: disabled for this direct release")
print("Future scheduling code: preserved")
PY

git add ship.sh public/style.css public/sw.js public/update.json

if git diff --cached --name-only | grep -Ei '(^|/)(\.env($|\.)|.*\.db$|.*\.sqlite3?$|.*backup.*|.*\.bak$|.*\.pem$|.*\.key$|id_rsa)'; then
  echo "ERROR: May sensitive o backup file. Push cancelled."
  exit 1
fi

git diff --cached --check

echo "===== FILES TO PUSH ====="
git diff --cached --name-only
git diff --cached --stat

git commit -m "Upgrade premium admin dashboard and direct release"
git push origin main

echo "===== GITHUB PUSH COMPLETE ====="
git log -1 --oneline
