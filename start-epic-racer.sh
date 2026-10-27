#!/bin/bash
# Double-click to start Epic Racer (macOS; also works as a shell script on Linux).
# Uses Node 22+ if installed, otherwise downloads a private copy into .tools/ (no admin needed).
cd "$(dirname "$0")" || exit 1

pause_on_error() { echo; read -r -p "  Press Enter to close this window." _; exit 1; }

NODE=""
if [ -z "$EPIC_FORCE_PORTABLE_NODE" ] && command -v node >/dev/null 2>&1; then
  if node -e "process.exit(parseInt(process.versions.node) >= 22 ? 0 : 1)" 2>/dev/null; then
    NODE="$(command -v node)"
  fi
fi
if [ -z "$NODE" ] && [ -x ".tools/node/bin/node" ]; then NODE=".tools/node/bin/node"; fi

if [ -z "$NODE" ]; then
  echo
  echo "  Epic Racer needs Node.js. Downloading a private copy (about 30 MB, one time only)..."
  case "$(uname -s)" in Darwin) OS=darwin ;; *) OS=linux ;; esac
  case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
  BASE="https://nodejs.org/dist/latest-v22.x"
  mkdir -p .tools
  SUMS="$(curl -fsSL "$BASE/SHASUMS256.txt")" || { echo "  Couldn't reach nodejs.org. Check your internet connection."; pause_on_error; }
  LINE="$(echo "$SUMS" | grep -E "node-v22[^ ]*-$OS-$ARCH\.tar\.gz$" | head -1)"
  FILE="$(echo "$LINE" | awk '{print $2}')"
  SUM="$(echo "$LINE" | awk '{print $1}')"
  [ -n "$FILE" ] || { echo "  Couldn't find a Node download for $OS-$ARCH."; pause_on_error; }
  curl -fL --progress-bar "$BASE/$FILE" -o ".tools/node.tar.gz" || pause_on_error
  if command -v shasum >/dev/null 2>&1; then GOT="$(shasum -a 256 .tools/node.tar.gz | awk '{print $1}')"
  else GOT="$(sha256sum .tools/node.tar.gz | awk '{print $1}')"; fi
  [ "$GOT" = "$SUM" ] || { echo "  The download didn't check out (checksum mismatch). Try again."; rm -f .tools/node.tar.gz; pause_on_error; }
  rm -rf .tools/node && tar -xzf .tools/node.tar.gz -C .tools && mv ".tools/${FILE%.tar.gz}" .tools/node && rm -f .tools/node.tar.gz
  NODE=".tools/node/bin/node"
fi

"$NODE" tools/launch.mjs || pause_on_error
