// Cost / context visibility mod for Claude Code (UI band + optional pane).
// Requires Claude Code >= 2.1.287.
// Note: "/cost" is reserved (alias of built-in /usage) — use /spend for the pane.

const PANE_ID = 'cost-visibility'
const CAPS_CONFIG_KEY = 'cost-visibility.costGuards'
const CAPS_STORE_KEY = 'costGuards'

const LIMIT_LABEL = {
  five_hour: '5h',
  seven_day: 'week',
  spend_limit: 'spend',
}

const LIMIT_LABEL_LONG = {
  five_hour: '5-hour plan window',
  seven_day: '7-day week window',
  spend_limit: 'spend cap',
}

// Nerd Fonts (Font Awesome). Needs a Nerd Font in the terminal.
// Avoid fa-memory (\uf538) — missing in some NF builds (renders as tofu).
const I = {
  clock: '\uf017', // fa-clock-o
  calendar: '\uf073', // fa-calendar
  usd: '\uf155', // fa-usd
  users: '\uf0c0', // fa-users
  ctx: '\uf1c0', // fa-database (context window)
  wrench: '\uf0ad', // fa-wrench
  bolt: '\uf0e7', // fa-bolt
  warn: '\uf071', // fa-warning
  circle: '\uf111', // fa-circle
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  if (n < 10) return '$' + n.toFixed(2)
  return '$' + n.toFixed(1)
}

function fmtTok(n) {
  if (n == null) return '—'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k'
  return String(n)
}

function costUsd(usage) {
  const c = usage?.cost
  if (typeof c === 'number') return c
  if (c && typeof c.usd === 'number') return c.usd
  if (c && typeof c.total === 'number') return c.total
  return null
}

function limitLabel(kind) {
  return LIMIT_LABEL[kind] || kind || 'limit'
}

function limitLabelLong(kind) {
  return LIMIT_LABEL_LONG[kind] || kind || 'limit'
}

function limitIcon(kind) {
  if (kind === 'seven_day') return I.calendar
  if (kind === 'spend_limit') return I.usd
  return I.clock
}

function barParts(pct, width) {
  const w = width || 8
  const raw = Number(pct) || 0
  const capped = Math.max(0, Math.min(100, raw))
  const filled = Math.round((capped / 100) * w)
  return {
    filled: '█'.repeat(filled),
    empty: '░'.repeat(w - filled),
    over: raw > 100,
  }
}

function bar(pct, width) {
  const { filled, empty } = barParts(pct, width)
  return filled + empty
}

function untilReset(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d >= 1) return d + 'd' + (h % 24 ? h % 24 + 'h' : '')
  if (h >= 1) return h + 'h' + (m % 60 ? m % 60 + 'm' : '')
  return m + 'm'
}

/** Soft label for the pane only — never shouted in the band. */
function statusWord(pct) {
  if (pct == null) return 'unknown'
  if (pct >= 100) return 'full'
  if (pct >= 85) return 'tight'
  if (pct >= 70) return 'warm'
  return 'ok'
}

function pctColor(pct) {
  if (pct == null) return 'subtle'
  if (pct >= 100) return 'error'
  if (pct >= 85) return 'error'
  if (pct >= 70) return 'warning'
  return 'success'
}

function formatLimitShort(lim) {
  const p = Math.round(lim.percentUsed ?? 0)
  const reset = untilReset(lim.resetsAt)
  const { filled, empty } = barParts(p, 6)
  return (
    limitIcon(lim.kind) +
    ' ' +
    limitLabel(lim.kind) +
    ' ' +
    filled +
    empty +
    ' ' +
    p +
    '%' +
    (reset ? ' ' + reset : '')
  )
}

/** Colored meter chip: icon + label + bar + % + countdown */
function meterChip(Text, Box, lim, barWidth) {
  const p = Math.round(lim.percentUsed ?? 0)
  const color = pctColor(p)
  const { filled, empty, over } = barParts(p, barWidth || 8)
  const reset = untilReset(lim.resetsAt)
  const kids = [
    el(Text, { color }, (over ? I.bolt + ' ' : '') + limitIcon(lim.kind)),
    el(Text, { color }, ' ' + limitLabel(lim.kind) + ' '),
    el(Text, { color }, filled),
    el(Text, { color: 'inactive' }, empty),
    el(Text, { color, bold: p >= 85 }, ' ' + p + '%'),
  ]
  if (reset) kids.push(el(Text, { color: 'subtle' }, ' · ' + reset))
  return el(Box, null, ...kids)
}

function sep(Text) {
  return el(Text, { color: 'inactive' }, '  │  ')
}

function burnChip(Text, Box, icon, color, label) {
  return el(
    Box,
    null,
    el(Text, { color: color || 'subtle' }, icon + ' '),
    el(Text, { color: color || 'text' }, label),
  )
}

async function readUsage($) {
  try {
    return await $.session.usage()
  } catch {
    return null
  }
}

function el(factory, props, ...children) {
  const p = props ? { ...props } : {}
  if (children.length === 1) p.children = children[0]
  else if (children.length > 1) p.children = children
  return factory(p)
}

async function openPane($) {
  const result = await $.ui.open({
    id: PANE_ID,
    title: 'Cost & usage',
    placement: 'dock',
    rows: 24,
  })
  $.ui.invalidate('ui.render')
  return result
}

/** Persist costGuards via userConfig; store is a same-session fallback. */
async function writeCapsConfig($, enabled) {
  try {
    $.store.set(CAPS_STORE_KEY, enabled === true)
  } catch {
    /* optional */
  }
  try {
    const result = await $.config.set({
      key: CAPS_CONFIG_KEY,
      value: enabled === true,
    })
    if (result?.deny) {
      return { ok: false, reason: String(result.deny), persisted: 'denied' }
    }
    return { ok: true, persisted: 'config' }
  } catch (err) {
    return {
      ok: true,
      persisted: 'session-store',
      reason: err?.message || 'config.set unavailable; kept for this session via store',
    }
  }
}

export function register(on, raw = {}) {
  let lastUsage = null
  let toolCalls = 0
  let agentSpawns = 0
  let lastCostSeen = 0
  let mainCostUsd = 0
  let agentCostUsd = 0
  /** Live flag — default off (HUD only). Synced from userConfig / /spend caps / /config. */
  let capsOn = raw?.costGuards === true
  /** @type {Map<string, { type: string, description: string, usd: number, turns: number }>} */
  const agents = new Map()

  function noteCostDelta(usage, agentId) {
    const total = costUsd(usage)
    if (total == null) return
    const delta = Math.max(0, total - lastCostSeen)
    lastCostSeen = total
    if (delta === 0) return
    if (agentId) {
      agentCostUsd += delta
      const row = agents.get(agentId)
      if (row) {
        row.usd += delta
        row.turns += 1
      }
    } else {
      mainCostUsd += delta
    }
  }

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'spend',
        description:
          'Cost HUD pane. /spend · /spend close · /spend caps [on|off]',
        argumentHint: '[close|caps on|caps off]',
      })
    } catch {
      /* optional */
    }

    // Options from manifest win; store covers in-session toggle before reload.
    try {
      if (raw?.costGuards === true) capsOn = true
      else if (raw?.costGuards === false) capsOn = false
      else if ($.store.get(CAPS_STORE_KEY) === true) capsOn = true
    } catch {
      /* keep capsOn */
    }

    lastUsage = await readUsage($)
    const total = costUsd(lastUsage)
    if (total != null) lastCostSeen = total

    // Icons need a Nerd Font in the terminal — remind once per machine.
    try {
      const key = 'nerdFontHintShown'
      if (!$.store.get(key)) {
        $.store.set(key, true)
        await $.ui.toast(
          'cost-visibility: set a Nerd Font as your terminal font for icons (meters work either way). See README.',
          { timeoutMs: 8000 },
        )
      }
    } catch {
      /* toast/store unavailable — non-fatal */
    }

    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Keep live flag in sync when the person toggles via /config UI.
  on('config.set', { key: CAPS_CONFIG_KEY }, async ($, e, next) => {
    const result = await next(e)
    capsOn = (result?.value ?? e.value) === true
    try {
      $.store.set(CAPS_STORE_KEY, capsOn)
    } catch {
      /* optional */
    }
    $.ui.invalidate('ui.render')
    return result
  }).catch((_$, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    lastUsage = await readUsage($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    lastUsage = await readUsage($)
    noteCostDelta(lastUsage, e.agentId)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    toolCalls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  }).catch(() => {})

  on('agent.spawn', async ($, e, next) => {
    agentSpawns += 1
    if (capsOn) {
      const desc = String(e.description || e.prompt || '').toLowerCase()
      const bg =
        e.runInBackground === true ||
        e.run_in_background === true ||
        e.background === true
      if (
        desc.includes('code-review max') ||
        desc.includes('5+5 angles') ||
        desc.includes('multi-angle') ||
        /angle [a-e]:/.test(desc)
      ) {
        return {
          deny: 'cost-visibility: multi-angle / code-review max agents banned (cost guards on). Use /code-review medium|high, or /spend caps off.',
        }
      }
      if (bg) {
        return {
          deny: 'cost-visibility: background agents disabled (cost guards on). /spend caps off to allow.',
        }
      }
    }
    const result = await next(e)
    const id = result?.agentId || result?.id
    if (id) {
      agents.set(id, {
        type: String(e.subagentType || e.type || 'agent'),
        description: String(e.description || '').slice(0, 80),
        usd: 0,
        turns: 0,
      })
    }
    $.ui.invalidate('ui.render')
    return result
  }).catch(($, e, next) => {
    if (capsOn) {
      return {
        deny: 'cost-visibility: agent.spawn hook error — denying spawn (cost guards on, fail-closed)',
      }
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!capsOn) return next(e)
    const text = String(e.text || '').toLowerCase()
    if (
      (text.includes('/code-review') || text.includes('/review')) &&
      (/\bxhigh\b/.test(text) ||
        /\bultra\b/.test(text) ||
        text.includes('/code-review max') ||
        /(^|[\s])max([\s]|$)/.test(text) ||
        text.includes('braba') ||
        text.includes('5+5'))
    ) {
      return {
        drop: 'cost-visibility: /code-review max|xhigh|ultra|braba blocked (cost guards on). Try /code-review medium, or /spend caps off.',
      }
    }
    return next(e)
  }).catch((_$, _e, next) => next)

  on('command.run', { command: 'spend' }, async ($, e) => {
    lastUsage = await readUsage($)
    const args = String(e.args || '').trim()
    const words = args.split(/\s+/).filter(Boolean)

    if (words[0] === 'close') {
      await $.ui.close(PANE_ID)
      return { text: 'Closed cost pane.' }
    }

    if (words[0] === 'caps' || words[0] === 'guards') {
      const action = (words[1] || 'status').toLowerCase()
      if (action === 'status' || action === '') {
        return {
          text:
            'Cost guards: ' +
            (capsOn ? 'ON' : 'OFF') +
            ' (default OFF = HUD only).\n' +
            'Toggle: /spend caps on · /spend caps off\n' +
            'Also: /config → cost-visibility → Cost guards',
        }
      }
      if (action === 'on' || action === 'true' || action === '1') {
        capsOn = true
        const r = await writeCapsConfig($, true)
        $.ui.invalidate('ui.render')
        return {
          text:
            'Cost guards ON — blocking /code-review max|xhigh|ultra|braba, background agents, multi-angle fan-out.' +
            (r.persisted === 'config' ? '' : '\n(' + (r.reason || 'session-only until config persists') + ')'),
        }
      }
      if (action === 'off' || action === 'false' || action === '0') {
        capsOn = false
        const r = await writeCapsConfig($, false)
        $.ui.invalidate('ui.render')
        return {
          text:
            'Cost guards OFF — HUD only, no blocks from this mod.' +
            (r.persisted === 'config' ? '' : '\n(' + (r.reason || 'session-only until config persists') + ')'),
        }
      }
      return {
        text: 'Usage: /spend caps [on|off|status]',
      }
    }

    await openPane($)
    return {
      text:
        summarize(lastUsage) +
        '\nGuards ' +
        (capsOn ? 'ON' : 'OFF') +
        ' · pane open · /spend close · /spend caps on|off',
    }
  })

  function summarize(usage) {
    const total = costUsd(usage)
    const ctx = usage?.context || {}
    const parts = []
    for (const lim of usage?.rateLimits || []) {
      parts.push(formatLimitShort(lim))
    }
    parts.push('this chat ' + fmtUsd(total))
    parts.push('agents ' + fmtUsd(agentCostUsd) + '×' + agentSpawns)
    if (ctx.percent != null) {
      parts.push('ctx ' + Math.round(ctx.percent) + '%')
    }
    return parts.join(' · ')
  }

  // Primary UX: always-on two-line band with colors + Nerd Font icons + bars.
  // Line 1 = plan meters. Line 2 = this-chat burn + details.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    if (e.surface && e.surface !== 'terminal') return undefined
    const { Text, Box } = $.ui.resolve(e)
    const usage = lastUsage || (await readUsage($))
    lastUsage = usage
    const total = costUsd(usage)
    const ctx = usage?.context || {}
    const ctxPct = ctx.percent != null ? Math.round(ctx.percent) : null
    const limits = usage?.rateLimits || []
    const width = Math.max(40, e.props.bodyColumns || 80)
    const narrow = width < 90
    const barW = narrow ? 6 : 8

    const five = limits.find((l) => l.kind === 'five_hour')
    const week = limits.find((l) => l.kind === 'seven_day')
    const spend = limits.find((l) => l.kind === 'spend_limit')
    const ordered = [five, week, spend].filter(Boolean)

    const planRow = ordered.length
      ? el(
          Box,
          { width, paddingRight: 5 },
          ...ordered.flatMap((lim, i) =>
            i === 0
              ? [meterChip(Text, Box, lim, barW)]
              : [sep(Text), meterChip(Text, Box, lim, barW)],
          ),
        )
      : el(
          Text,
          { color: 'subtle' },
          I.clock + ' plan meters after the first reply',
        )

    const ctxColor = pctColor(ctxPct)
    const ctxLabel =
      ctxPct != null
        ? ctxPct + '% ' + bar(ctxPct, 5) + ' ' + fmtTok(ctx.tokens) + '/' + fmtTok(ctx.window)
        : '—'
    const moneyColor = (total ?? 0) >= 5 ? 'warning' : (total ?? 0) > 0 ? 'claude' : 'subtle'
    const agentColor = agentSpawns > 0 ? 'warning' : 'subtle'

    const burnRow = el(
      Box,
      { justifyContent: 'space-between', paddingRight: 5, width },
      el(
        Box,
        null,
        burnChip(Text, Box, I.usd, moneyColor, fmtUsd(total ?? 0)),
        sep(Text),
        burnChip(
          Text,
          Box,
          I.circle,
          'subtle',
          'main ' + fmtUsd(mainCostUsd),
        ),
        sep(Text),
        burnChip(
          Text,
          Box,
          I.users,
          agentColor,
          agentSpawns > 0
            ? fmtUsd(agentCostUsd) + ' ×' + agentSpawns
            : '0 agents',
        ),
        sep(Text),
        burnChip(Text, Box, I.ctx, ctxColor, ctxLabel),
        sep(Text),
        burnChip(Text, Box, I.wrench, 'subtle', String(toolCalls)),
      ),
      el(Text, { color: 'suggestion' }, '/spend'),
    )

    return el(
      Box,
      { flexDirection: 'column', width, gap: 0 },
      planRow,
      burnRow,
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const usage = lastUsage
    const total = costUsd(usage)
    const pct = usage?.context?.percent
    const five = usage?.rateLimits?.find((l) => l.kind === 'five_hour')
    const suffix =
      ' · ' +
      I.usd +
      ' ' +
      fmtUsd(total) +
      (pct != null ? ' · ' + I.ctx + ' ' + Math.round(pct) + '%' : '') +
      (five
        ? ' · ' + I.clock + ' ' + Math.round(five.percentUsed ?? 0) + '%'
        : '') +
      (agentSpawns ? ' · ' + I.users + ' ' + agentSpawns : '')
    return next({ ...e, props: { ...e.props, suffix } })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    const { Text, Box, Button, Markdown } = $.ui.resolve(e)
    const usage = lastUsage || (await readUsage($))
    lastUsage = usage
    const ctx = usage?.context || {}
    const limits = usage?.rateLimits || []
    const total = costUsd(usage)
    const ctxPct = ctx.percent != null ? Math.round(ctx.percent) : null

    const limitMd = limits.length
      ? limits
          .map((l) => {
            const p = Math.round(l.percentUsed ?? 0)
            const resetAbs = l.resetsAt ? new Date(l.resetsAt).toLocaleString() : '?'
            const resetRel = untilReset(l.resetsAt)
            return (
              '- ' +
              limitIcon(l.kind) +
              ' **' +
              limitLabelLong(l.kind) +
              '** — ' +
              statusWord(p) +
              ' at **' +
              p +
              '%** `' +
              bar(p, 10) +
              '`\n' +
              '  refreshes in **' +
              (resetRel || '?') +
              '** (' +
              resetAbs +
              ')'
            )
          })
          .join('\n')
      : '_No plan-window reading yet (needs a reply on a Claude subscription)._'

    const agentRows = [...agents.entries()]
    const agentMd = agentRows.length
      ? agentRows
          .map(([id, a]) => {
            return (
              '- `' +
              id.slice(0, 8) +
              '` **' +
              a.type +
              '**: ' +
              fmtUsd(a.usd) +
              ' · ' +
              a.turns +
              ' turn(s)' +
              (a.description ? ' — ' + a.description : '')
            )
          })
          .join('\n')
      : '_No subagents spawned this session._'

    const md =
      '## Money this session\n\n' +
      'Estimated **API list price** (same yardstick as `/cost` / `cost.usd`). ' +
      'On a Team subscription this is a burn meter, not your invoice.\n\n' +
      '| | USD |\n|---|---:|\n' +
      '| **Whole session** | **' +
      fmtUsd(total) +
      '** |\n' +
      '| Main thread | ' +
      fmtUsd(mainCostUsd) +
      ' |\n' +
      '| Subagents (sum) | ' +
      fmtUsd(agentCostUsd) +
      ' |\n' +
      '| Subagents spawned | ' +
      agentSpawns +
      ' |\n' +
      '| Tool calls | ' +
      toolCalls +
      ' |\n\n' +
      '## Context window\n\n' +
      (ctxPct != null
        ? '- **' +
          ctxPct +
          '%** filled — ' +
          fmtTok(ctx.tokens) +
          ' / ' +
          fmtTok(ctx.window) +
          ' tokens\n- Soft target: stay under ~70–85% (auto-compact ~150k)\n'
        : '_Waiting for the first model reply._\n') +
      '\n## Plan / rate limits\n\n' +
      limitMd +
      '\n\n## Subagents\n\n' +
      agentMd +
      '\n\n## Cost guards\n\n' +
      (capsOn
        ? '**ON** — blocking `/code-review` max|xhigh|ultra|braba, background agents, multi-angle fan-out.\n'
        : '**OFF** (default) — HUD only, no blocks from this mod.\n') +
      'Toggle: `/spend caps on` · `/spend caps off` · `/config`\n\n' +
      '_Org **monthly** spend: Team Owners → claude.ai → Usage._\n\n' +
      '- Session `' +
      $.session.id() +
      '`\n' +
      '- Model `' +
      $.session.model() +
      '`'

    return el(
      Box,
      {
        flexDirection: 'column',
        gap: 1,
        width: e.props.bodyColumns,
        padding: 1,
      },
      el(Markdown, { text: md }),
      el(
        Box,
        { gap: 1 },
        el(Button, {
          key: 'refresh',
          label: 'Refresh',
          hotkey: 'r',
          onPress: async () => {
            lastUsage = await readUsage($)
            $.ui.invalidate('ui.render')
          },
        }),
        el(Button, {
          key: 'close',
          label: 'Close',
          hotkey: 'c',
          onPress: async () => {
            await $.ui.close(PANE_ID)
          },
        }),
      ),
      el(
        Text,
        { dimColor: true },
        'Tip: dollars are list-price estimates. Shell `claude-cost` has multi-session history.',
      ),
    )
  })
}
