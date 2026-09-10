# Troubleshooting

## The chip is not in the status bar

Work through these in order.

1. **Is the plugin enabled?** Settings → Plugins → `hermes-session-costs`. The
   desktop half of a unified package ships opt-in, so a fresh install is
   *installed but disabled*. Toggle it on.

2. **Is a session focused?** The chip only renders when a session is in focus
   and the plugin knows something about it. On a brand-new empty draft with no
   session, it stays quiet.

3. **Are there two copies installed?** If you previously used the standalone
   version, remove `~/.hermes/desktop-plugins/session-stats` — see
   [Install and upgrade](Install-and-upgrade).

4. **Reload plugins.** ⌘K (macOS) / Ctrl+K (Windows, Linux) → **Reload desktop
   plugins**. Note this command only
   rescans *new* plugin folders; for an already-known plugin that failed to
   load, touch/re-save `desktop/plugin.js` (or reinstall) so the file watcher
   picks it up.

5. **Check the log.** The packaged desktop app opens no debug port; its renderer
   console is captured to a log file. Look for plugin load failures:

   ```bash
   grep -a 'plugins\]' ~/.hermes/logs/desktop.log | tail -20
   ```

   A successful load logs nothing, so a *failed* load is what you are looking
   for: `[plugins] runtime load failed (<id>) …`, or a rendered error chip.

## The context window shows `—`

That session has no live runtime inside the desktop app, so no usage stream
exists. This is expected for sessions driven by an external process (for example
`hermes chat --oneshot` from an orchestration script): tokens and cost still come
from the stored session row, but the context window is genuinely unknown and is
never guessed.

To see the context meter, the session must be running **in** the app.

## The Compress button is greyed out

Same cause: compression targets a live session's runtime, and a session running
outside the app has none. Open the session and continue it in the app, or
compress it from wherever it is actually running (`/compress`).

## Unit prices show `—` on every row

Hermes retrieves live unit prices only for providers that publish a pricing API:
Nous, OpenRouter, Vercel AI Gateway, Novita, DeepInfra, Fireworks. On Anthropic
direct, OpenAI direct, DeepSeek direct, local Ollama or a custom endpoint there
is no published price to show, so the panel shows `—` instead of inventing one.
The aggregate cost is unaffected — that is computed by Hermes independently.

Prices may also be `—` briefly on a cold backend while the pricing catalog warms
up. Opening the panel triggers a refresh; reopening it later usually resolves.

## The per-side costs do not add up to the total exactly

Expected. The per-side figures are derived from the *displayed* unit rate, which
is rounded (two decimals, widened for sub-cent prices), while the total is
Hermes' own precise accounting — which may also include sides this panel does not
itemise (for example cache **writes**). Per-side values are marked `~` for that
reason; treat the total as authoritative.

## Cost says "estimated" instead of "billed"

Until a provider reports actual billed amounts, Hermes records an estimate from
its pricing table. The label tells you which you are looking at. Both are per
session.

## I did not get a notification when compression finished

Notifications fire only for compressions started from this plugin's **Compress
conversation** button. Automatic compaction — Hermes compressing on its own as
context fills — is intentionally silent.

Also check that plugin notifications are allowed: Settings → Notifications →
"Plugin notifications". OS notifications additionally require the app to be in
the background.

## The chip numbers look stale after switching sessions

The chip is tied to the focused session and refreshes when a turn completes. If
you switch sessions while a fetch is in flight, the plugin ignores results that
belong to the session you left, so you may briefly see the previous session's
numbers until the new one's data lands. Clicking into the session again forces a
refresh.

## Reporting a bug

Include: your Hermes version, the model, whether the session has a live runtime
in the app, the relevant `~/.hermes/logs/desktop.log` lines, and a screenshot of
the panel.

<https://github.com/tomRumi/hermes-session-costs/issues>
