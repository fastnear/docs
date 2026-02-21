#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ARCHIVE="mike-docs-archive.tar.gz"

tar czf "$ARCHIVE" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.idea' \
  --exclude='yarn.lock' \
  --exclude='package-lock.json' \
  --exclude='redoc-static.html' \
  --exclude='test-embed.html' \
  --exclude="$ARCHIVE" \
  --exclude='create_archive.sh' \
  .

echo "Created $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
