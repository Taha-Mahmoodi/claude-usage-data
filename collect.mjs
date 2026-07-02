#!/usr/bin/env node
// Claude Code Stop hook: extract usage METADATA from the transcript, queue it,
// and batch-push to the public data repo. No prompt/response content is ever read
// beyond counting tool_use blocks. No external dependencies.
//
// Config (~/.claude-usage/config.json, all optional):
//   { "device": "macbook-air", "dataRepoPath": "/path/to/clone", "pushIntervalMin": 5 }
// Env overrides: CLAUDE_USAGE_DIR, CLAUDE_USAGE_DEVICE, CLAUDE_USAGE_REPO.
import {
  readFileSync,
  appendFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const HOME = homedir();
const DIR = process.env.CLAUDE_USAGE_DIR || join(HOME, ".claude-usage");
const QUEUE = join(DIR, "queue.ndjson");
const STATE = join(DIR, "state.json");
const CONFIG = join(DIR, "config.json");

function readJson(p, fallback) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function loadConfig() {
  const c = readJson(CONFIG, {});
  const rawDevice = c.device || process.env.CLAUDE_USAGE_DEVICE || hostname();
  return {
    device: rawDevice.replace(/[^a-zA-Z0-9._-]/g, "-"),
    dataRepoPath:
      c.dataRepoPath || process.env.CLAUDE_USAGE_REPO || join(DIR, "claude-usage-data"),
    pushIntervalMin: c.pushIntervalMin ?? 5,
  };
}

// Pure — find the last assistant turn carrying a usage block. Exported for tests.
export function extractUsage(transcriptText) {
  const lines = transcriptText.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = obj.message ?? obj;
    const usage = msg?.usage;
    if (!usage || msg?.role !== "assistant") continue;
    const content = Array.isArray(msg.content) ? msg.content : [];
    const tool_calls = content.filter((b) => b && b.type === "tool_use").length;
    return {
      model: msg.model || obj.model || "unknown",
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_tokens: usage.cache_read_input_tokens || 0,
      tool_calls,
    };
  }
  return null;
}

function git(cwd, args, timeout = 20000) {
  return execFileSync("git", args, {
    cwd,
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
}

// Append the queue to the device file and push. Transactional: the queue is
// cleared ONLY on a fully successful push; any failure hard-resets the working
// tree back to the remote so a retry can't double-append (design spec: "queue
// retained and retried on the next hook firing — no data loss, just delay").
function sync(cfg) {
  const repo = cfg.dataRepoPath;
  if (!existsSync(join(repo, ".git"))) return; // not set up yet — keep queuing
  if (!existsSync(QUEUE)) return;
  const queued = readFileSync(QUEUE, "utf8");
  if (!queued.trim()) return;

  try {
    git(repo, ["pull", "--rebase", "--autostash"]);
    const dataDir = join(repo, "data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    appendFileSync(join(dataDir, `${cfg.device}.ndjson`), queued);

    const manifestPath = join(repo, "devices.json");
    const manifest = readJson(manifestPath, []);
    if (!manifest.includes(cfg.device)) {
      manifest.push(cfg.device);
      writeFileSync(manifestPath, JSON.stringify(manifest) + "\n");
    }

    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-m", `usage: ${cfg.device}`]);
    git(repo, ["push"]);

    writeFileSync(QUEUE, ""); // success — clear queue
    writeFileSync(STATE, JSON.stringify({ lastPush: Date.now() }) + "\n");
  } catch {
    // Roll back any local append/commit to match the remote; keep the queue.
    try {
      git(repo, ["reset", "--hard", "@{u}"]);
    } catch {
      /* nothing safe to reset to (no upstream) — leave as-is, retry next time */
    }
  }
}

function main() {
  mkdirSync(DIR, { recursive: true });
  let hook;
  try {
    hook = JSON.parse(readFileSync(0, "utf8")); // Stop-hook JSON on stdin
  } catch {
    return; // no/invalid input — nothing to do
  }
  const cfg = loadConfig();

  const tpath = hook.transcript_path;
  if (!tpath || !existsSync(tpath)) return;
  const usage = extractUsage(readFileSync(tpath, "utf8"));
  if (!usage) return; // no usage block in this turn

  const row = {
    ts: new Date().toISOString(),
    ...usage,
    session_id: hook.session_id || "unknown",
  };
  appendFileSync(QUEUE, JSON.stringify(row) + "\n");

  const { lastPush = 0 } = readJson(STATE, {});
  if (Date.now() - lastPush >= cfg.pushIntervalMin * 60_000) sync(cfg);
}

// Run main only when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
