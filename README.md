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
