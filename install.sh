#!/usr/bin/env bash
# Install helper for claude-mod-cost-visibility
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> cost-visibility · prerequisites"
echo

# 1) Nerd Font (required for icons)
if bash "$ROOT/scripts/check-nerd-font.sh"; then
  :
else
  echo
  echo "Install a Nerd Font, point your terminal at it, then re-run this script."
  echo "Downloads: https://www.nerdfonts.com/font-downloads"
  echo
fi

# 2) Claude Code version hint
if command -v claude >/dev/null 2>&1; then
  ver="$(claude --version 2>/dev/null | head -1 || true)"
  echo "Claude Code: ${ver:-found}"
  echo "(mods need ≥ 2.1.287)"
else
  echo "claude CLI not found in PATH — install Claude Code first."
fi

echo
echo "==> Install the mod"
echo
echo "  claude plugin marketplace add patitow/claude-mod-cost-visibility"
echo "  claude plugin install cost-visibility@claude-mod-cost-visibility"
echo
echo "Or from this clone:"
echo
echo "  claude --plugin-dir \"$ROOT/plugins/cost-visibility\""
echo
echo "Then restart Claude Code. Band appears above the prompt; type /spend for the pane."
