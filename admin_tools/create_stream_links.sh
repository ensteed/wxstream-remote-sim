#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$PROJECT_ROOT/streams"
SRC_DIR="/root/sim_stream/streams"

rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

for src in "$SRC_DIR"/*_stream.wav; do
  [ -e "$src" ] || continue

  base="$(basename "$src")"
  name="${base%_stream.wav}.wav"
  dest="$DEST_DIR/$name"

  ln -sf "$src" "$dest"
  echo "Linked $dest -> $src"
done
