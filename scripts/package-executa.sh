#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXECUTA="$ROOT/executas/mini-notes-summarizer"
DIST="$ROOT/dist"
TOOL="mini-notes-summarizer"
OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" != "Darwin" ]]; then
  echo "This script packages macOS. Use package-executa.ps1 on Windows." >&2
  exit 1
fi
case "$ARCH" in
  arm64) PLATFORM="darwin-arm64" ;;
  x86_64) PLATFORM="darwin-x86_64" ;;
  *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
esac

cargo build --release --manifest-path "$EXECUTA/Cargo.toml"
STAGE="$DIST/stage-$PLATFORM"
rm -rf "$STAGE"
mkdir -p "$STAGE/bin"
cp "$EXECUTA/target/release/$TOOL" "$STAGE/bin/$TOOL"
chmod 755 "$STAGE/bin/$TOOL"
cat > "$STAGE/manifest.json" <<EOF
{
  "name": "tool-test-mini-notes-summarizer-12345678",
  "version": "1.0.0",
  "runtime": {
    "binary": {
      "entrypoint": "bin/$TOOL",
      "permissions": {"bin/$TOOL": "0o755"}
    }
  }
}
EOF
ARCHIVE="$DIST/$TOOL-$PLATFORM.tar.gz"
tar -C "$STAGE" -czf "$ARCHIVE" manifest.json "bin/$TOOL"
echo "$ARCHIVE"
