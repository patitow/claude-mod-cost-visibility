# claude-mod-cost-visibility

**A [Claude Code](https://code.claude.com) mod** — live session cost, context window, and plan-quota meters *above the prompt*. Built for the new mods / function-hooks API (2.1.287+).

> Burned an org monthly spend on a `/code-review max` fan-out once. Never again.

![demo](./assets/demo.gif)

![Claude Code](https://img.shields.io/badge/Claude_Code-mod-0F0F0F?style=flat-square)
![Requires](https://img.shields.io/badge/requires-≥2.1.287-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## Why this name

| Layer | Name | Why |
| --- | --- | --- |
| GitHub repo / marketplace | `claude-mod-cost-visibility` | Searchable for **claude mod** + **cost** (mods just shipped) |
| Plugin id | `cost-visibility` | Short install id, same style as `budget-guard` / `quota-meter` |

## What you get

Two-line band above the prompt (colors + Nerd Font icons + meter bars):

```
 5h ██████░░ 103% · 2h47m  │   week ██░░░░░░ 32% · 4d2h
 $1.24  │  main $0.83  │   $0.41 ×2  │   42% ██░░░ 84k/200k  │   12    /spend
```

- **Plan windows** — 5h / 7d (and gateway spend cap) with countdown
- **This-chat burn** — list-price `$` (`cost.usd`), split main vs subagents
- **Context meter** — % + tokens / window
- **`/spend`** — side pane with the full table (Refresh / Close)
- **Optional caps** — blocks `/code-review` `max` / `xhigh` / `ultra` / `braba`, background agents, multi-angle review fan-out

> Dollars are **API list-price estimates** (same yardstick as Claude’s cost ledger). On a Team/subscription plan they are a burn meter, not your invoice. Org monthly spend still lives in claude.ai → Usage (Owners).

Needs a **Nerd Font** in the terminal for icons (without it you get tofu boxes; meters still work).

## Install

### Marketplace (recommended)

```bash
claude plugin marketplace add patitow/claude-mod-cost-visibility
claude plugin install cost-visibility@claude-mod-cost-visibility
```

Restart Claude Code, then look above the prompt. Type `/spend` for the pane.

### One-shot / local

```bash
git clone https://github.com/patitow/claude-mod-cost-visibility.git
claude --plugin-dir ./claude-mod-cost-visibility/plugins/cost-visibility
```

Or always-on via settings `env`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/absolute/path/to/claude-mod-cost-visibility/plugins/cost-visibility"
  }
}
```

### Validate

```bash
claude plugin validate ./plugins/cost-visibility
```

## Caps (built into the mod)

| Pattern | Behavior |
| --- | --- |
| `/code-review` max / xhigh / ultra / braba | Dropped |
| Background agent fan-out | Denied |
| Multi-angle “5+5” review agents | Denied |

Soft guidance: keep context under ~70–85%; avoid mega-transcripts.

## How it works

Uses the mods API:

- `$.session.usage()` → `cost.usd`, `context`, `rateLimits`
- `ui.render` → `AbovePrompt` band + `Spinner` suffix + `Pane`
- `turn.complete` → attributes cost deltas to main vs `agentId`
- `prompt.submit` / `agent.spawn` → optional hard caps

No network calls. Nothing is sent to the model from this mod.

## Related tools

If you want history across sessions from JSONL logs, pair with a local reporter (`claude-cost`, `claudetop`, `cost-analysis`, etc.). This mod is the **live HUD**.

## License

MIT — see [LICENSE](./LICENSE).
