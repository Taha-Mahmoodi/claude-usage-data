#!/usr/bin/env bash
# One-line installer for the Claude usage collector.
#   curl -fsSL https://raw.githubusercontent.com/Taha-Mahmoodi/claude-usage-data/main/install.sh | bash
#
# Installs a Claude Code Stop hook that records usage METADATA (token counts,
# model, tool-call counts — never prompt/response content) and pushes it to the
# public data repo the dashboard reads. Safe to re-run (idempotent).
set -euo pipefail

RAW="https://raw.githubusercontent.com/Taha-Mahmoodi/claude-usage-data/main"
REPO_URL="https://github.com/Taha-Mahmoodi/claude-usage-data"
DIR="${CLAUDE_USAGE_DIR:-$HOME/.claude-usage}"
CLONE="$DIR/claude-usage-data"
SETTINGS="$HOME/.claude/settings.json"
DEVICE="${CLAUDE_USAGE_DEVICE:-$(hostname -s 2>/dev/null || hostname)}"

command -v node >/dev/null || { echo "✗ node is required (the collector is a Node script)"; exit 1; }
command -v git  >/dev/null || { echo "✗ git is required"; exit 1; }

mkdir -p "$DIR" "$(dirname "$SETTINGS")"

echo "→ fetching collector"
curl -fsSL "$RAW/collect.mjs" -o "$DIR/collect.mjs"

echo "→ cloning data repo (for pushing)"
if [ ! -d "$CLONE/.git" ]; then git clone --quiet "$REPO_URL" "$CLONE"; else git -C "$CLONE" pull --quiet --rebase || true; fi

if [ ! -f "$DIR/config.json" ]; then
  printf '{ "device": "%s", "dataRepoPath": "%s", "pushIntervalMin": 5 }\n' "$DEVICE" "$CLONE" > "$DIR/config.json"
  echo "→ wrote config (device: $DEVICE)"
else
  echo "→ config exists, leaving as-is"
fi

echo "→ registering Stop hook in $SETTINGS"
node - "$SETTINGS" "$DIR/collect.mjs" <<'NODE'
const fs = require("fs");
const [, , path, script] = process.argv;
let j = {};
try { j = JSON.parse(fs.readFileSync(path, "utf8")); } catch {}
j.hooks = j.hooks || {};
j.hooks.Stop = j.hooks.Stop || [];
const present = JSON.stringify(j.hooks.Stop).includes("collect.mjs");
if (!present) {
  j.hooks.Stop.push({ hooks: [{ type: "command", command: `node "${script}"`, async: true }] });
}
fs.writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
console.log(present ? "   hook already present" : "   hook added");
NODE

echo ""
echo "✓ installed on '$DEVICE'."
echo "  • Make sure 'git push' works from $CLONE (gh auth login, SSH key, or a PAT with write access)."
echo "  • Restart Claude Code (or open /hooks once) so the Stop hook loads."
echo "  • Usage flows to $REPO_URL and shows up on the dashboard."
