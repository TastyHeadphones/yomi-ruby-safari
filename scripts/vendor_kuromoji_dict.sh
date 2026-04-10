#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RES_DIR="$ROOT_DIR/YomiRubySafariExtension/Resources"
DICT_DIR="$RES_DIR/dict"

cd "$ROOT_DIR"

TARBALL="$(npm pack kuromoji --silent | tail -n 1)"

mkdir -p "$DICT_DIR"

tar -xzf "$TARBALL" --strip-components=2 -C "$RES_DIR" package/build/kuromoji.js

tar -xzf "$TARBALL" --strip-components=2 -C "$DICT_DIR" \
  package/dict/base.dat.gz \
  package/dict/cc.dat.gz \
  package/dict/check.dat.gz \
  package/dict/tid_map.dat.gz \
  package/dict/tid_pos.dat.gz \
  package/dict/tid.dat.gz \
  package/dict/unk_char.dat.gz \
  package/dict/unk_compat.dat.gz \
  package/dict/unk_invoke.dat.gz \
  package/dict/unk_map.dat.gz \
  package/dict/unk_pos.dat.gz \
  package/dict/unk.dat.gz

rm -f "$TARBALL"

echo "Vendored kuromoji.js + IPADIC dictionary into $RES_DIR"
