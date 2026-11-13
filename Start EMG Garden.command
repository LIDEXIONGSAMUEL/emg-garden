#!/bin/zsh
set -e
cd -- "${0:A:h}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Install Node.js 22 LTS, then open this launcher again.'
  read '?Press Return to close. '
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci
fi
print 'Building EMG Garden. Keep this window open while using the app.'
npm run build
npm start
