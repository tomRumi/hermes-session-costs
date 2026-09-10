# How it works

This page is the technical reference: where every number comes from, why some
of them are estimates, and what the plugin can and cannot reach.

## Delivery shape

The repository is a **unified Hermes plugin package** — one installable folder
with two halves:

```
~/.hermes/plugins/hermes-session-costs/
├── plugin.yaml          # manifest: declares no capabilities
├── __init__.py          # agent half: registers nothing (see below)
└── desktop/
    └── plugin.js        # desktop half: the whole feature
```

The agent half exists because Hermes requires a directory plugin to be an
importable module with a `register()` entry point — not because the plugin has
any agent-side behaviour. It is an explicit no-op that registers **no** tools,
hooks, middleware, or environment variables, matching what the manifest
declares. Declaring nothing and registering nothing is the accurate description
of a pure desktop UI plugin; anything else would be capability creep.

The desktop half is loaded from the regular agent-plugin root
(`~/.hermes/plugins/<id>/desktop/plugin.js`) through the same renderer pipeline
as standalone desktop plugins, hot reload included. Because it is the desktop
half of a unified package, it is **opt-in**: it appears in Settings → Plugins
but stays disabled until the user enables it.

## Which session the chip describes

The chip follows **focus**: the chat in the main workspace, or whichever session
tile you last interacted with. It subscribes to Hermes' focused-session state
atoms, so clicking into another tile re-points the whole readout. Switching to a
session that has no runtime inside the app does not blank the chip — see
"Two data sources" below.

## Two data sources

This is the single most important thing to understand about the plugin.

### 1. The live usage stream (preferred)

Hermes streams usage for sessions it is actively driving: token totals, the
context window size, context used, context percentage, API call count, cache hit
rate and throughput. The chip prefers these numbers whenever they are
non-zero — they are the freshest, and they are the only source that knows the
context window at all.

### 2. The persisted session row (fallback)

Cost is **not** in the live stream. Cumulative cost and the per-side token
counts live on the session's stored row, which the plugin reads through the
desktop's persisted-sessions door. That row also carries the model id.

A session driven by an **external process** — for example `hermes chat --oneshot`
launched by an orchestration script — appears in the sidebar and can be opened,
but the app holds no live runtime for it. No usage ever streams, so the plugin
falls back to the stored row:

```
611k tok · — · $2.34
```

Tokens and cost are real (from the row); the context window is genuinely
unknown, so it renders `—` rather than a fabricated number.

Rows are tagged with the session id they were fetched for, so a slow fetch that
resolves after you switch sessions can never paint one session's numbers onto
another.

## Where the cost number comes from

**The plugin does not fetch prices.** Hermes computes cost itself and stores
`actual_cost_usd` (when the provider reported a billed amount) or
`estimated_cost_usd` (Hermes' own pricing-table arithmetic). The plugin only
displays it, and labels which of the two it is.

That distinction matters: most sessions show an **estimate**. Once a provider
reports actual billing, the label switches to billed.

## Where the unit prices come from

The panel's per-side breakdown needs a **per-1M-token rate** for the model. The
plugin reads it from Hermes' own model catalog — the same source the model
picker uses (`model.options`, which exposes `pricing[modelId]` per provider).

Hermes retrieves those prices live only for providers that publish a pricing
API:

| Provider | Live unit prices |
| --- | --- |
| Nous, OpenRouter, Vercel AI Gateway, Novita, DeepInfra, Fireworks | yes |
| Anthropic direct, OpenAI direct, DeepSeek direct, local Ollama, custom endpoints | no |

Where no price is published, every side shows `—`. The plugin never invents a
rate. The catalog call is made when you open the panel (not while the panel is
closed), uses cached values first and refreshes once if the model was not yet
priced, and memoizes the answer — including "no price" — per model.

## The per-side split

The three sides do not overlap. Hermes counts the prompt side as
`prompt = input + cache_read + cache_write`, so the row's `input_tokens` is the
**non-cached** prompt side. That gives an honest split:

| Row | Tokens | Rate |
| --- | --- | --- |
| Input (uncached) | `input_tokens` | input rate |
| Cached input | `cache_read_tokens` | cache-read rate |
| Output | `output_tokens` | output rate |

The cached-input row appears only when the model publishes a cache-read price
and the session actually used cache reads.

Per-side costs are **derived** from the rate as displayed (rounded to two
decimals, widened for sub-cent prices), so they are approximate by construction
and are prefixed `~`. The aggregate total above them is the authoritative figure.

## Compression

The **Compress conversation** button calls the same backend RPC the built-in
`/compress` command dispatches to (`session.compress`), targeting the live
runtime id of the focused session.

Compression is LLM-bound and can outlive the request window on a large session.
Two outcomes are handled:

- **Finished in-band** — the result is reported immediately (messages removed,
  or the compression summary's headline).
- **Still running in the background** — the plugin says so, and arms a watch.

The plugin cannot rewrite the transcript itself. But when a background
compression finishes, Hermes emits a gateway status event
(`status.update` with `kind: 'compacted'`), and the app refreshes the transcript
on its own. The plugin listens for the same event, scoped to compressions the
button actually started, so automatic background compactions stay quiet.

When the watched compression completes, the panel note flips to a confirmation
and a toast fires; if the app is in the background, an OS notification is sent
too, so you know you can carry on.

## Notification scope

Only compressions started from this plugin's button notify. Automatic
compaction — Hermes compressing on its own as the context fills — does not
trigger a notification, by design.

## Storage

The plugin keeps no state of its own beyond the app's normal settings
persistence. Unit prices are memoized in memory for the life of the app session;
nothing is written to disk.

## Version floor

The plugin uses desktop SDK surfaces that require the status-bar area, focused
session state, the persisted-sessions door, the gateway event stream and OS
notifications. The manifest declares `requires_hermes: ">=0.21"`.
