# claude-usage-data

Public **metadata-only** store for the [claude-usage-dashboard](https://github.com/Taha-Mahmoodi/claude-usage-dashboard).
Written by a Claude Code `Stop` hook on each device. **Never contains prompt or response content.**

## Layout
- `devices.json` — `["macbook-air", "desktop-pc", ...]`, one entry per device.
- `data/<device>.ndjson` — one JSON object per line:

```json
{"ts":"2026-07-01T14:32:00Z","model":"claude-opus-4-8","input_tokens":1200,"output_tokens":340,"cache_creation_tokens":800,"cache_read_tokens":4200,"tool_calls":2,"session_id":"abc123"}
```

Each device only ever writes its own file, so concurrent pushes never conflict.

## Install the collector (per device)

```sh
curl -fsSL https://raw.githubusercontent.com/Taha-Mahmoodi/claude-usage-data/main/install.sh | bash
```

Installs a Claude Code `Stop` hook that records usage metadata and pushes it here.
`git push` from the local clone must work (`gh auth login`, SSH key, or a write PAT).
Source of the collector: [`plugin/`](https://github.com/Taha-Mahmoodi/claude-usage-dashboard/tree/dev/plugin) in the dashboard repo.
