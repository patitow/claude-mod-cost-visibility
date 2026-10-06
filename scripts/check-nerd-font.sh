#!/usr/bin/env bash
# Warn if this machine has no Nerd Font (icons in the band need one).
set -euo pipefail

have_nerd=0
matches=""

if command -v fc-list >/dev/null 2>&1; then
  matches="$(fc-list : family 2>/dev/null | grep -iE 'nerd ?font|nerdfont|\bNF\b' || true)"
  if [[ -n "$matches" ]]; then
    have_nerd=1
  fi
fi

# Also accept common install paths if fontconfig is stale
if [[ "$have_nerd" -eq 0 ]]; then
  for dir in \
    "$HOME/.local/share/fonts" \
    "$HOME/.fonts" \
    "/usr/share/fonts" \
    "/usr/local/share/fonts" \
    "/Library/Fonts" \
    "$HOME/Library/Fonts"
  do
    [[ -d "$dir" ]] || continue
    if find "$dir" -iname '*nerd*font*.ttf' -o -iname '*nerd*font*.otf' -o -iname '*NerdFont*.ttf' 2>/dev/null | head -1 | grep -q .; then
      have_nerd=1
      matches="${matches}"$'\n'"found under $dir"
      break
    fi
  done
fi

if [[ "$have_nerd" -eq 1 ]]; then
  echo "cost-visibility: Nerd Font detected — icons should render."
  echo "$matches" | sed '/^$/d' | sort -u | head -8 | sed 's/^/  · /'
  echo
  echo "Make sure your terminal profile uses that font (not just that it is installed)."
  exit 0
fi

cat <<'EOF'
cost-visibility: no Nerd Font found on this machine.

The band uses Font Awesome glyphs from a Nerd Font. Without one, icons show as
□ / tofu — meters and numbers still work.

Install one (pick any), then set it as your terminal font:

  # https://www.nerdfonts.com/font-downloads

  # Homebrew
  brew install --cask font-jetbrains-mono-nerd-font

  # Or download JetBrainsMono / FiraCode / Hack Nerd Font and install the .ttf/.otf

Then in your terminal preferences → Font → choose a face with "Nerd Font" / "NF" in the name.
EOF
exit 1
