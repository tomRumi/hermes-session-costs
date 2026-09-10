/**
 * Hermes Session Costs — per-session token usage, cost (USD) and context meter
 * for the Hermes desktop status bar, with a one-click context compressor.
 *
 *   <hermes home>/plugins/hermes-session-costs/desktop/plugin.js
 *
 * This is the DESKTOP HALF of a unified Hermes plugin package: the folder also
 * carries `plugin.yaml` (the agent half, which declares no tools or hooks — the
 * feature is pure desktop UI). It is discovered from the regular agent-plugin
 * root and drives the same renderer pipeline as the standalone disk door.
 * https://github.com/tomRumi/hermes-session-costs
 *
 * For the FOCUSED session (follows the chat/tile in focus):
 *   - ribbon chip: cumulative tokens · context used/max (pct) · cost USD
 *   - a session driven OUTSIDE the app (`hermes chat --oneshot` from a dispatch
 *     script, any external orchestrator) has no runtime here, so no live usage
 *     stream ever arrives. The chip then falls back to the persisted session
 *     row and reports the context window as "—" ("unknown") instead of hiding
 *     the whole readout. Live counters win once the session actually runs here.
 *   - click the chip → panel: context bar + model, tokens in/out, API calls,
 *     compressions, cost, and a Compress conversation button that runs the
 *     same gateway session.compress RPC as the app's "/compress" slash
 *     command. (Compress needs a runtime, so it stays disabled on a session
 *     that isn't running inside the app.)
 *   - the panel's Cost section splits the spend per side: Input (uncached),
 *     Cached input and Output, each as `tokens · $/Mtok · cost`. Tokens come
 *     from the session row; the $/Mtok rates come from the model catalog's own
 *     pricing (`model.options` → `providers[].pricing[modelId]`, the same
 *     numbers the model picker shows) — LIVE for providers that publish a
 *     pricing API (nous, openrouter, ai-gateway, novita, deepinfra, fireworks),
 *     and "—" for the rest (anthropic/openai direct, local + custom endpoints).
 *     Per-side costs are DERIVED from the displayed rate and carry a "~".
 *   - pressing Compress when the backend keeps working past the request
 *     window arms a completion watch: the gateway's "compacted" status
 *     event fires an in-app toast (+ OS notification if the app is in the
 *     background) so you know the context is freed and you can carry on.
 *     Only button-pressed compressions notify — automatic background
 *     compactions stay quiet.
 *
 * Plain ESM, loaded uncompiled — jsx() calls only, no JSX syntax. Only
 * @hermes/plugin-sdk, react and react/jsx-runtime resolve.
 */
import { Button, cn, Codicon, Dialog, DialogContent, haptic, host, Tip, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'
import { useCallback, useEffect, useRef, useState } from 'react'

const ID = 'hermes-session-costs'
const WARN_PCT = 85
const DANGER_PCT = 92
// The gateway caps a compress host-wait near 630s; anything still unconfirmed
// after 15 min is not coming (silently drop the watch so it can't leak).
const ARM_EXPIRY_MS = 15 * 60 * 1000

// Compressions the plugin started that the backend is still finishing in the
// background (RPC answered `pending` or timed out). Keyed by RUNTIME session
// id, as the gateway's status.update events carry.
const backgroundCompressions = new Set()
const doneListeners = new Set()
let osNotify = null // ctx.os.notify, captured in register() (feature-guarded)

function armBackground(sid) {
  if (!sid) return
  backgroundCompressions.add(sid)
  setTimeout(() => backgroundCompressions.delete(sid), ARM_EXPIRY_MS)
}

/** Subscribe to "a background compression finished" for a session. Returns a disposer. */
function onCompressionDone(fn) {
  doneListeners.add(fn)
  return () => doneListeners.delete(fn)
}

function fireCompressionDone(sid) {
  for (const fn of [...doneListeners]) {
    try {
      fn(sid)
    } catch {
      // a listener must never break the others
    }
  }
}

// -- formatting ---------------------------------------------------------------

function fmtCount(n) {
  const v = Number(n) || 0
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`
  return `${Math.round(v)}`
}

function fmtUsd(v) {
  const n = Number(v) || 0
  if (!isFinite(n) || n <= 0) return null
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

/** A tiny derived cost (one side of the split) — never render "$0.0000". */
function fmtUsdTiny(v) {
  const n = Number(v) || 0
  if (!isFinite(n) || n <= 0) return '$0'
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  if (n >= 0.0001) return `$${n.toFixed(4)}`
  return '<$0.0001'
}

// -- unit prices (the model catalog's $/Mtok, same numbers the picker shows) ----

// The gateway's `model.options` payload carries, per provider,
// `pricing[modelId] = { input, output, cache, free }` — formatted $/Mtok
// strings, LIVE where the provider exposes a pricing API (nous, openrouter,
// ai-gateway, novita, deepinfra, fireworks) and absent everywhere else
// (anthropic/openai direct, local + custom endpoints) — where the readout
// shows "—" rather than inventing a rate.
// Keyed by model id; a null value caches "this model has no price" so an
// unpriced model doesn't re-probe the catalog on every open.
const pricingByModel = new Map()

/** Parse a formatted "$0.06" / "free" price into $/Mtok, or null when unknown. */
function parseRate(formatted) {
  if (typeof formatted !== 'string') return null
  const text = formatted.trim()
  if (!text || text === '?') return null
  if (text === 'free') return 0
  const value = Number(text.replace(/[^0-9.]/g, ''))
  return Number.isFinite(value) ? value : null
}

function findPricing(payload, model) {
  const exact = []
  const suffix = []
  const tail = model.split('/').pop()

  for (const provider of payload?.providers ?? []) {
    const pricing = provider?.pricing ?? {}
    if (pricing[model]) exact.push(pricing[model])
    else {
      const key = Object.keys(pricing).find(k => k.split('/').pop() === tail)
      if (key) suffix.push(pricing[key])
    }
  }

  // Exact id wins; a unique last-segment match is the only fallback (several
  // matches would be a coin flip, e.g. a `:batch` sibling of the same model).
  const hit = exact[0] ?? (suffix.length === 1 ? suffix[0] : null)
  if (!hit) return null

  return {
    input: parseRate(hit.input),
    output: parseRate(hit.output),
    cache: parseRate(hit.cache),
    free: Boolean(hit.free)
  }
}

/** $/Mtok rates for a model id, or null when the model is not priced. Fetched
 *  from the cached catalog first, then ONCE with a real refresh (a cold backend
 *  has no prices resident yet); the answer — including "no price" — is memoized. */
async function loadModelPricing(model, profile) {
  if (!model) return null
  if (pricingByModel.has(model)) return pricingByModel.get(model)

  for (const refresh of [false, true]) {
    try {
      const payload = await host.request('model.options', {
        ...(profile ? { profile } : {}),
        ...(refresh ? { refresh: true } : {})
      })
      const found = findPricing(payload, model)
      if (found) {
        pricingByModel.set(model, found)
        return found
      }
    } catch {
      // Catalog unavailable — fall through to "no price" rather than failing the panel.
    }
  }

  pricingByModel.set(model, null)
  return null
}

// -- the focused session's persisted row (cost lives there, not in the stream) --

async function loadSessionRow(storedId, profile) {
  if (!storedId) return null
  try {
    const page = await host.listPersistedSessions(null, { profile: profile || '', limit: 500 })
    const rows = page?.sessions ?? page?.items ?? []
    const row = rows.find(r => r?.id === storedId || r?.resolved_id === storedId) || null
    if (!row) return null
    const cost = Number(row.actual_cost_usd ?? row.estimated_cost_usd ?? 0) || null
    return {
      // Tagged with the id it belongs to so a stale row can never paint for a
      // session the user has since switched away from.
      storedId,
      // `input_tokens` is the NON-cached prompt side (CanonicalUsage.prompt_tokens
      // = input + cache_read + cache_write), so it pairs with the input rate and
      // the cache row below is a separate line, not a subset of it.
      cacheRead: Number(row.cache_read_tokens) || 0,
      model: typeof row.model === 'string' ? row.model : '',
      input: Number(row.input_tokens) || 0,
      output: Number(row.output_tokens) || 0,
      cost,
      costKind: Number(row.actual_cost_usd ?? 0) > 0 ? 'actual' : 'estimated'
    }
  } catch {
    return null
  }
}

// -- chip ---------------------------------------------------------------------

function StatsChip() {
  const usage = useValue(host.state.focusedUsage)
  const [open, setOpen] = useState(false)
  const [row, setRow] = useState(null)
  const storedId = useValue(host.state.focusedStoredSessionId)
  const profile = useValue(host.state.focusedSessionProfile)
  const busy = useValue(host.state.busy)
  const calls = usage?.calls ?? 0

  // Persisted row (tokens + cost) for the focused session: on session change,
  // when the panel opens, and shortly after a turn finishes.
  const refreshRow = useCallback(() => {
    void loadSessionRow(storedId, profile).then(r => setRow(prev => (r && prev?.cost === r.cost && prev.input === r.input ? prev : r)))
  }, [storedId, profile])
  useEffect(() => { refreshRow() }, [refreshRow])
  useEffect(() => {
    if (open) refreshRow()
  }, [open, refreshRow])
  const prevCalls = useRef(calls)
  useEffect(() => {
    const changed = calls !== prevCalls.current
    prevCalls.current = calls
    if (changed && !busy) {
      const t = setTimeout(refreshRow, 2_500)
      return () => clearTimeout(t)
    }
  }, [calls, busy, refreshRow])

  // A stale row must never paint for the session the user switched to: the
  // fetch resolves after the switch, so trust it only for the id it was for.
  const sessionRow = row && row.storedId === storedId ? row : null

  // Show the chip for any focused session we know something about. A session
  // driven OUTSIDE the app (e.g. `hermes chat --oneshot` from a dispatch
  // script) has no runtime here, so no live usage stream ever arrives: fall
  // back to the persisted session row and report the context as unknown
  // rather than hiding the whole readout.
  if (!usage && !sessionRow) return null

  const contextMax = usage?.context_max ?? 0
  const contextUsed = usage?.context_used ?? 0
  const pct = contextMax > 0 ? Math.round(usage?.context_percent ?? (contextUsed / contextMax) * 100) : null
  const danger = pct !== null && pct >= DANGER_PCT
  const warn = pct !== null && pct >= WARN_PCT && !danger

  const liveInput = usage?.input ?? 0
  const liveOutput = usage?.output ?? 0
  const liveTotal = usage?.total ?? (liveInput + liveOutput)
  const rowTotal = sessionRow ? sessionRow.input + sessionRow.output : 0
  // Prefer the live counters once the session has actually run here; a
  // freshly resumed session reports zero calls while the row holds its real
  // totals, so the row is the better answer until the first call lands.
  const useRow = liveTotal <= 0 && rowTotal > 0
  const totalTokens = useRow ? rowTotal : liveTotal

  const cost = sessionRow?.cost ?? null
  const costKind = sessionRow?.costKind ?? 'estimated'

  const ctxLabel = contextMax > 0
    ? `${fmtCount(contextUsed)}/${fmtCount(contextMax)}${pct !== null ? ` (${pct}%)` : ''}`
    : '—'

  const tooltip = [
    `Tokens consumed: ${fmtCount(totalTokens)}`,
    liveTotal > 0 ? `${fmtCount(liveInput)} in / ${fmtCount(liveOutput)} out` : null,
    cost ? `Cost: ${fmtUsd(cost)}${costKind === 'estimated' ? ' (est.)' : ''}` : 'Cost: n/a',
    contextMax > 0 ? `Context: ${ctxLabel}` : 'Context: unknown (no live session data)',
    'Click for details and compress'
  ].filter(Boolean).join(' · ')

  const chipLabel = [
    `${fmtCount(totalTokens)} tok`,
    ctxLabel,
    cost ? fmtUsd(cost) : null
  ].filter(Boolean).join(' · ')

  return jsxs(Fragment, {
    children: [
      jsx(Tip, {
        label: tooltip,
        children: jsx('button', {
          type: 'button',
          'aria-label': tooltip,
          className: cn(
            'inline-flex h-full items-center gap-1 whitespace-nowrap px-1.5 text-[0.6875rem] tabular-nums transition-colors',
            danger
              ? 'text-destructive hover:bg-(--chrome-action-hover) hover:text-destructive'
              : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
            warn && 'text-(--ui-accent)'
          ),
          onClick: () => { haptic('tap'); setOpen(true) },
          children: chipLabel
        })
      }),
      jsx(StatsDialog, {
        open,
        onOpenChange: setOpen,
        usage,
        row: sessionRow,
        onCompressed: refreshRow
      })
    ]
  })
}

/** Hears the gateway's `status.update` events and turns a completed background
 *  compression (one the plugin started) into a notification. Mounted beside
 *  the chip; null-rendering so it can't paint anything. */
function CompressionWatcher() {
  useEffect(
    () =>
      host.onEvent('status.update', ev => {
        const sid = ev?.session_id
        const kind = ev?.payload?.kind
        if (!sid || kind !== 'compacted') return
        // Only sessions the plugin's own Compress button armed. `.delete`
        // returns true exactly once, so a duplicate event can't double-notify.
        if (!backgroundCompressions.delete(sid)) return
        fireCompressionDone(sid)
        host.notify({ kind: 'success', message: 'Context compression complete — you can carry on with the session.' })
        try {
          osNotify?.({ title: 'Hermes — context compression complete', body: 'The session context was freed. You can carry on.' })
        } catch {
          // OS notifications are best-effort (gated to when the app is away)
        }
      }),
    []
  )
  return null
}

// -- panel --------------------------------------------------------------------

function Row({ label, children }) {
  return jsxs('div', {
    className: 'flex items-center justify-between gap-3',
    children: [
      jsx('span', { className: 'text-muted-foreground', children: label }),
      jsx('span', { className: 'shrink-0 tabular-nums text-foreground', children })
    ]
  })
}

function Section({ title, children }) {
  return jsxs('div', {
    className: 'flex flex-col gap-1.5',
    children: [
      jsx('p', { className: 'text-[0.6875rem] font-medium uppercase tracking-wide text-(--ui-text-quaternary)', children: title }),
      children
    ]
  })
}

function StatsDialog({ open, onOpenChange, usage, row, onCompressed }) {
  const [compressing, setCompressing] = useState(false)
  const [note, setNote] = useState(null) // { kind: 'ok'|'info'|'error', text }
  const [pricing, setPricing] = useState(null)
  const runtimeId = useValue(host.state.focusedSessionId)
  const storedId = useValue(host.state.focusedStoredSessionId)
  const profile = useValue(host.state.focusedSessionProfile)

  // Unit prices for the focused session's model — loaded when the panel opens
  // (the catalog call is the one network leg), memoized per model in the module.
  const modelId = usage?.model || row?.model || ''
  useEffect(() => {
    if (!open || !modelId) {
      return
    }

    let alive = true
    setPricing(null)
    void loadModelPricing(modelId, profile).then(found => {
      if (alive) setPricing(found)
    })

    return () => { alive = false }
  }, [open, modelId, profile])

  const contextMax = usage?.context_max ?? 0
  const contextUsed = usage?.context_used ?? 0
  const pct = contextMax > 0
    ? Math.max(0, Math.min(100, Math.round(usage?.context_percent ?? (contextUsed / contextMax) * 100)))
    : null
  const est = usage?.context_estimated

  const liveInput = usage?.input ?? 0
  const liveOutput = usage?.output ?? 0
  const liveTotal = usage?.total ?? (liveInput + liveOutput)
  const rowTotal = row ? row.input + row.output : 0
  const totalTokens = liveTotal > 0 ? liveTotal : rowTotal
  const cost = row?.cost ?? null
  const costKind = row?.costKind ?? 'estimated'

  // The per-side split. Tokens come from the persisted row (the live stream
  // reports no cache-read count); rates come from the catalog. Costs for each
  // side are DERIVED from the displayed rate, so they carry a "~".
  const splitInput = (liveTotal > 0 ? liveInput : (row?.input ?? 0))
  const splitOutput = (liveTotal > 0 ? liveOutput : (row?.output ?? 0))
  const splitCache = row?.cacheRead ?? 0
  const rateLabel = rate => (rate === null || rate === undefined
    ? '—'
    : rate === 0 ? 'free' : `$${rate < 0.01 ? rate.toFixed(4) : rate.toFixed(2)}/1M`)
  const sideCost = (tokens, rate) => (rate === null || rate === undefined ? '—' : fmtUsdTiny((tokens / 1e6) * rate))
  const sides = [
    { id: 'input', label: 'Input (uncached)', tokens: splitInput, rate: pricing?.input },
    ...(pricing && pricing.cache !== null && splitCache > 0
      ? [{ id: 'cache', label: 'Cached input', tokens: splitCache, rate: pricing.cache }]
      : []),
    { id: 'output', label: 'Output', tokens: splitOutput, rate: pricing?.output }
  ]

  // Reset the transient result note when the dialog reopens for another chat.
  useEffect(() => {
    if (open) { setNote(null); setCompressing(false) }
  }, [open, storedId])

  // A background compression (armed below) finishing updates the dialog's note
  // live, even minutes after the button press.
  useEffect(
    () =>
      onCompressionDone(sid => {
        if (!runtimeId || sid !== runtimeId) return
        setNote({ kind: 'ok', text: '✓ Compression complete — context freed. You can carry on.' })
        onCompressed()
      }),
    [runtimeId, onCompressed]
  )

  const compress = useCallback(async () => {
    if (!runtimeId || compressing) return
    haptic('tap')
    setCompressing(true)
    setNote(null)
    const targetId = runtimeId
    try {
      const res = await host.request('session.compress', { session_id: targetId })
      if (res?.status === 'pending') {
        // Backend keeps working past the request window — arm the watcher;
        // the "compacted" event will notify when it actually finishes.
        armBackground(targetId)
        setNote({
          kind: 'info',
          text: (res?.message || 'Compression is still running in the background — large sessions take a while.')
            + ' You will be notified when it is done.'
        })
      } else {
        const headline = res?.summary?.headline
        const tokenLine = res?.summary?.token_line
        const removed = Number(res?.removed ?? 0)
        const msg = headline
          ? tokenLine ? `${headline} (${tokenLine})` : headline
          : removed > 0 ? `Compressed ${removed} messages into a summary.` : (res?.message || 'Compressed.')
        setNote({ kind: 'ok', text: msg })
        host.notify({ kind: 'success', message: msg })
      }
      onCompressed()
    } catch (err) {
      const text = String(err instanceof Error ? err.message : err)
      if (/method not found|unknown method|not found/i.test(text)) {
        setNote({ kind: 'error', text: 'This backend predates session.compress — type "/compress" in the chat instead.' })
      } else {
        // 30s gateway default: large sessions outlive it. The server keeps
        // compressing; the "compacted" event fires when it finishes.
        armBackground(targetId)
        setNote({ kind: 'info', text: 'Compression is still running in the background — you will be notified when it is done.' })
        host.notify({ kind: 'info', message: 'Compression started — still running in the background.' })
      }
    } finally {
      setCompressing(false)
    }
  }, [runtimeId, compressing, onCompressed])

  const close = () => onOpenChange(false)

  return jsx(Dialog, {
    open,
    onOpenChange,
    children: jsx(DialogContent, {
      className: 'w-[23rem]',
      children: jsxs('div', {
        className: 'flex flex-col gap-3.5 p-1 text-[0.75rem]',
        children: [
          jsxs('div', {
            className: 'flex items-baseline justify-between gap-2',
            children: [
              jsx('p', { className: 'font-medium text-foreground', children: 'Session stats' }),
              jsx('span', { className: 'text-[0.6875rem] text-muted-foreground', children: usage?.model || '' })
            ]
          }),

          jsxs('div', {
            className: 'flex flex-col gap-1',
            children: [
              jsxs('div', {
                className: 'flex items-baseline justify-between',
                children: [
                  jsx('span', { className: 'text-[0.6875rem] text-muted-foreground', children: 'Context window' }),
                  jsx('span', {
                    className: 'text-[0.6875rem] tabular-nums text-foreground',
                    children: contextMax > 0
                      ? `${est ? '~' : ''}${fmtCount(contextUsed)} / ${fmtCount(contextMax)}${pct !== null ? ` (${pct}%)` : ''}`
                      : '—'
                  })
                ]
              }),
              contextMax > 0 && jsx('div', {
                className: 'h-1.5 w-full overflow-hidden rounded-full bg-(--ui-stroke-tertiary)',
                children: jsx('div', {
                  className: cn('h-full rounded-full', pct !== null && pct >= DANGER_PCT ? 'bg-destructive' : 'bg-(--ui-accent)'),
                  style: { width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }
                })
              }),
              pct !== null && pct >= WARN_PCT && jsx('p', {
                className: 'text-[0.6875rem] text-destructive',
                children: pct >= DANGER_PCT
                  ? 'Context nearly full — compress before the next long turn.'
                  : 'Context getting large — consider compressing.'
              })
            ]
          }),

          jsx(Section, {
            title: 'Tokens consumed',
            children: jsxs('div', {
              className: 'flex flex-col gap-1',
              children: [
                jsx(Row, {
                  label: 'Total',
                  children: liveTotal > 0
                    ? `${fmtCount(liveTotal)} (${fmtCount(liveInput)} in / ${fmtCount(liveOutput)} out)`
                    : fmtCount(totalTokens)
                }),
                typeof usage?.calls === 'number' && jsx(Row, { label: 'API calls', children: String(usage.calls) }),
                (typeof usage?.compressions === 'number' || typeof usage?.compression_count === 'number') && jsx(Row, {
                  label: 'Compressions',
                  children: String(usage.compressions ?? usage.compression_count ?? 0)
                })
              ]
            })
          }),

          jsx(Section, {
            title: 'Cost',
            children: jsxs('div', {
              className: 'flex flex-col gap-1',
              children: [
                jsx(Row, {
                  label: costKind === 'actual' ? 'Total (billed)' : 'Total (estimated)',
                  children: cost ? fmtUsd(cost) : '—'
                }),
                jsx('div', { className: 'mt-0.5 h-px w-full bg-(--ui-stroke-tertiary)' }),
                jsx('p', {
                  className: 'text-[0.6875rem] text-(--ui-text-quaternary)',
                  children: pricing
                    ? 'tokens · unit price · cost for that side (~ = derived)'
                    : 'tokens · unit price · cost — rates appear when the provider publishes pricing'
                }),
                ...sides.map(side => jsxs('div', {
                  className: 'flex items-baseline justify-between gap-3',
                  children: [
                    jsx('span', { className: 'text-muted-foreground', children: side.label }),
                    jsxs('span', {
                      className: 'shrink-0 tabular-nums text-foreground',
                      children: [
                        fmtCount(side.tokens),
                        jsx('span', { className: 'text-(--ui-text-quaternary)', children: ' · ' }),
                        rateLabel(side.rate),
                        jsx('span', { className: 'text-(--ui-text-quaternary)', children: ' · ' }),
                        side.rate === null || side.rate === undefined ? '—' : `~${sideCost(side.tokens, side.rate)}`
                      ]
                    })
                  ]
                }, side.id))
              ]
            })
          }),

          jsx(Section, {
            title: 'Context',
            children: jsxs('div', {
              className: 'flex flex-col gap-1.5',
              children: [
                jsx('p', {
                  className: 'text-muted-foreground',
                  children: 'Compressing replaces the older conversation with a summary, freeing the window. You will be notified when it is done; the trimmed history re-renders automatically.'
                }),
                jsx(Button, {
                  size: 'sm',
                  variant: 'default',
                  disabled: compressing || !runtimeId,
                  onClick: () => void compress(),
                  className: 'w-full',
                  children: compressing
                    ? jsxs('span', { className: 'inline-flex items-center gap-1.5', children: [jsx(Codicon, { name: 'sync', className: 'size-3 animate-spin' }), 'Compressing…'] })
                    : 'Compress conversation'
                }),
                note && jsx('p', {
                  className: cn('text-[0.6875rem]', note.kind === 'error' ? 'text-destructive' : note.kind === 'ok' ? 'text-foreground' : 'text-muted-foreground'),
                  children: note.text
                })
              ]
            })
          }),

          jsx('div', {
            className: 'flex justify-end',
            children: jsx(Button, { size: 'sm', variant: 'ghost', onClick: close, children: 'Close' })
          })
        ]
      })
    })
  })
}

// -- registration --------------------------------------------------------------

export default {
  id: ID,
  name: 'Session Stats',
  register(ctx) {
    osNotify = typeof ctx?.os?.notify === 'function' ? opts => ctx.os.notify(opts) : null

    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 300,
      render: () => jsxs(Fragment, {
        children: [jsx(StatsChip, {}), jsx(CompressionWatcher, {})]
      })
    })
  }
}
