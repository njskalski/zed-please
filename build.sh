#!/usr/bin/env bash
set -euo pipefail

# build.sh — build both the tree-sitter grammar and the Zed extension
#
# Usage:
#   ./build.sh           # build everything
#   ./build.sh grammar   # regenerate tree-sitter parser only
#   ./build.sh extension # build Zed WASM extension only

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAMMAR_DIR="$SCRIPT_DIR/tree-sitter-please"
EXTENSION_DIR="$SCRIPT_DIR/zed-please"

build_grammar() {
    echo "==> Building tree-sitter grammar..."
    cd "$GRAMMAR_DIR"

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
    cd "$EXTENSION_DIR"

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

commit_grammar() {
    echo "==> Updating grammar git commit SHA in extension.toml..."
    cd "$GRAMMAR_DIR"
    SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
    if [ -z "$SHA" ]; then
        echo "    WARNING: tree-sitter-please is not a git repo, skipping SHA update."
        return
    fi
    cd "$EXTENSION_DIR"
    sed -i "s/^rev = \".*\"/rev = \"$SHA\"/" extension.toml
    echo "    Updated rev to $SHA"
}

TARGET="${1:-all}"

case "$TARGET" in
    grammar)
        build_grammar
        commit_grammar
        ;;
    extension)
        build_extension
        ;;
    all)
        build_grammar
        commit_grammar
        build_extension
        ;;
    *)
        echo "Usage: $0 [grammar|extension|all]"
        exit 1
        ;;
esac

echo ""
echo "Done."
