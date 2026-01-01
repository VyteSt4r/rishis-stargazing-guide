#!/usr/bin/env bash
set -euo pipefail

# Safe script to install nvm, Node LTS, then install deps and run dev server.
# NOTE: `xcode-select --install` opens a GUI prompt and must be accepted by the user.

echo "1/6 — Installing Xcode Command Line Tools (may open GUI)."
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install || true
  echo "If a GUI installer appeared, please complete it and re-run this script."
fi

echo "2/6 — Installing nvm (user-local)."
if [ ! -d "$HOME/.nvm" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
fi

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm install may have failed or requires a new shell. After running this script, run:\n  export NVM_DIR=\"$HOME/.nvm\" && . \"$NVM_DIR/nvm.sh\""
  exit 1
fi

echo "3/6 — Installing Node LTS and using it."
nvm install --lts
nvm use --lts

echo "4/6 — Verifying node and npm"
node -v
npm -v

echo "5/6 — Installing project dependencies"
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
npm install

echo "6/6 — Starting dev server (ctrl-c to stop)"
npm run dev

# End
