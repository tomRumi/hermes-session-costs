# Hermes Session Costs — wiki

Per-session token usage, cost (USD) and a context-window meter for the Hermes
desktop status bar, with one-click context compression.

## Start here

| Page | What it covers |
| --- | --- |
| [Install and upgrade](Install-and-upgrade) | One-click install link, CLI install, enabling the desktop half, upgrading, removing the old standalone copy |
| [What it does and does not do](What-it-does-and-does-not-do) | The honest capability list, including every limitation |
| [How it works](How-it-works) | Where each number comes from, the per-session data model, compression, notifications |
| [Troubleshooting](Troubleshooting) | Chip missing, `—` values, disabled Compress button, duplicate chips |

## The 30-second version

The status bar gets one chip describing **the session you are looking at**:

```
107k tok · 33k/200k (16%) · $0.03
```

- `107k tok` — cumulative tokens this session has consumed
- `33k/200k (16%)` — context window used vs. the model's maximum, and how full it is
- `$0.03` — what this session has cost, in USD

Click it for the full panel: context bar, tokens in/out, API calls, compression
count, cost, a per-side cost breakdown, and a **Compress conversation** button.

Amber past 85% context, red past 92% — the cue to compress before a long turn.

## Source

<https://github.com/tomRumi/hermes-session-costs>
