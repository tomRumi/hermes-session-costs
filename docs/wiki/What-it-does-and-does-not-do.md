# What it does and does not do

A precise capability list — including everything it deliberately does not do.

## What it does

### Status-bar chip

For the **focused** session (the chat or tile you are looking at):

- cumulative **tokens** consumed this session
- **context window** — used / maximum, with a percentage (Cline-style)
- **cost** in USD for this session

The chip follows focus, so clicking another session tile re-points it.

### Colour cues

- amber at **≥ 85%** of the context window
- red at **≥ 92%**

A glanceable "compress before your next long turn" signal.

### Details panel (click the chip)

- context bar with used / max / percentage, and the model id
- token split: total, input, output
- API call count
- compression count
- aggregate cost, labelled billed or estimated
- per-side cost breakdown

### Per-side cost breakdown

Three rows — `Input (uncached)`, `Cached input`, `Output` — each showing
`tokens · unit price per 1M · cost for that side`.

The cached-input row appears when the model has a published cache price and the
session actually read from cache.

### Compression

A **Compress conversation** button that runs the same backend compression as the
built-in `/compress` command. If the compression finishes in the background
because it outlived the request window, the panel tells you and then notifies
you when it completes — in-app toast, plus an OS notification if the app is in
the background.

## What it does not do

### Pricing and cost

- **It does not fetch prices.** Hermes computes all cost figures; the plugin
  displays them.
- **Not every provider has live unit prices.** Live pricing comes from the
  provider's own API and only exists for Nous, OpenRouter, Vercel AI Gateway,
  Novita, DeepInfra and Fireworks. For Anthropic direct, OpenAI direct, DeepSeek
  direct, local Ollama and custom endpoints, the unit price shows `—`.
- **Cost is usually an estimate.** Until a provider reports billed amounts, the
  figure is Hermes' pricing-table estimate. The panel says which it is.
- **Per-side costs are approximate.** They are derived from the displayed
  (rounded) rate and marked `~`. The aggregate total is authoritative.
- **USD only.** No currency conversion, no FX rates, no local-currency display.
- **No budgets, alerts or thresholds on spend.** It reports; it does not warn
  about money.
- **No all-sessions view.** You see the focused session. There is no table of
  every session's tokens and cost, and no project roll-up.

### Context and compression

- **No automatic compression.** It never compresses on its own — the button is
  always an explicit action. (Hermes' own configured auto-compaction is separate
  and unchanged.)
- **No compression options.** No "keep the last N turns", no focus topic for the
  summary. The built-in `/compress here 20` and `/compress <topic>` variants are
  not exposed.
- **Cannot compress a session with no live runtime.** The button is disabled for
  a session running outside the app — compression is a backend operation on a
  live session, so there is nothing to target.
- **Cannot rewrite the transcript.** After compressing, the trimmed history
  reappears via Hermes' own refresh; the plugin does not render it itself.
- **No context-window breakdown by category.** The percentage is shown, but not
  the system-prompt / tools / memory / conversation split (Hermes' own
  Context Usage popover does that).

### Scope and surfaces

- **Desktop app only.** Nothing appears in the CLI, the TUI, the web dashboard,
  or on messaging platforms.
- **No agent-side behaviour.** No tools, no hooks, no slash commands, no
  background jobs. The agent cannot call into this plugin.
- **No history or analytics.** No charts, no per-day totals, no export.
- **No configuration.** Nothing to configure — no settings screen, no config
  keys, no environment variables.
- **No themes or layout changes.** It adds one status-bar chip and one panel.

### Data

- **Sessions driven outside the app show no context window.** For a session with
  no live runtime (e.g. `hermes chat --oneshot` from a script), tokens and cost
  come from the stored session row and the context window renders `—`, because
  it is genuinely unknown.
- **Numbers are per session, not per project** — matching the session's own
  accounting, and reset when a new session starts.
- **A compressed conversation carries its lineage.** Cost is read for the
  session you are looking at; it does not aggregate a conversation's full
  compression history into one running total.
