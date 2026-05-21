#!/usr/bin/env bash
set -euo pipefail

# build.sh — build the tree-sitter grammar and the Zed extension
#
# Everything lives in one repo. The grammar (grammar.js, src/) is at the
# repo root alongside the Zed extension files (extension.toml, Cargo.toml).
#
# Usage:
#   ./build.sh           # build everything
#   ./build.sh grammar   # regenerate tree-sitter parser only
#   ./build.sh extension # build Zed WASM extension only

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

build_grammar() {
    echo "==> Building tree-sitter grammar..."
    cd "$SCRIPT_DIR"

    if ! command -v tree-sitter &>/dev/null; then
        echo "ERROR: tree-sitter CLI not found. Install with:"
        echo "  npm install -g tree-sitter-cli"
        exit 1
    fi

    tree-sitter generate
    echo "    Grammar generated."

    echo "    Running tests..."
    tree-sitter test
    echo "    Tests passed."
}

build_extension() {
    echo "==> Building Zed extension (wasm32-wasip1)..."
    cd "$SCRIPT_DIR"

    if ! command -v cargo &>/dev/null; then
        echo "ERROR: cargo not found. Install Rust via rustup: https://rustup.rs"
        exit 1
    fi

    if ! rustup target list --installed | grep -q wasm32-wasip1; then
        echo "    Installing wasm32-wasip1 target..."
        rustup target add wasm32-wasip1
    fi

    cargo build --target wasm32-wasip1 --release
    echo "    Extension built: target/wasm32-wasip1/release/zed_please.wasm"
}

update_sha() {
    echo "==> Updating grammar SHA in extension.toml..."
    cd "$SCRIPT_DIR"
    SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
    if [ -z "$SHA" ]; then
        echo "    WARNING: not a git repo, skipping SHA update."
        return
    fi
    sed -i "s/^rev = \".*\"/rev = \"$SHA\"/" extension.toml
    echo "    Updated rev to $SHA"
}

TARGET="${1:-all}"

case "$TARGET" in
    grammar)
        build_grammar
        ;;
    extension)
        build_extension
        ;;
    all)
        build_grammar
        build_extension
        ;;
    update-sha)
        update_sha
        ;;
    *)
        echo "Usage: $0 [grammar|extension|all|update-sha]"
        exit 1
        ;;
esac

echo ""
echo "Done."
