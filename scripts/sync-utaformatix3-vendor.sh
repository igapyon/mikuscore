#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

JS_URL="https://raw.githubusercontent.com/igapyon/utaformatix3-ts-plus/devel/dist/utaformatix3-ts-plus.mikuscore.iife.js"
DOC_URL="https://raw.githubusercontent.com/igapyon/utaformatix3-ts-plus/devel/utaformatix3-ts-plus.mikuscore.iife.js.md"

JS_DEST="$ROOT_DIR/src/vendor/utaformatix3/utaformatix3-ts-plus.mikuscore.iife.js"
DOC_DEST="$ROOT_DIR/docs/integrations/utaformatix3-ts-plus.mikuscore.iife.js.md"

tmp_js="$(mktemp)"
tmp_doc="$(mktemp)"
cleanup() {
  rm -f "$tmp_js" "$tmp_doc"
}
trap cleanup EXIT

echo "Downloading vendor JS from upstream..."
curl -fL -o "$tmp_js" "$JS_URL"

echo "Downloading integration doc from upstream..."
curl -fL -o "$tmp_doc" "$DOC_URL"

mv "$tmp_js" "$JS_DEST"
mv "$tmp_doc" "$DOC_DEST"

echo "Updated:"
echo "  - $JS_DEST"
echo "  - $DOC_DEST"
