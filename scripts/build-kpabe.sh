#!/usr/bin/env bash
# Rebuilds the KP-ABE WASM module and its shared test fixtures from an Aruna checkout.
# Usage: scripts/build-kpabe.sh [aruna checkout], default ../aruna; set CARGO to wrap Cargo.
set -euo pipefail
BINDGEN_VERSION=0.2.127

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARUNA="$(cd "${1:-$ROOT/../aruna}" && pwd)"
OUT="$ROOT/src/lib/vault/kpabe"
FIXTURES="$ROOT/src/lib/vault/__fixtures__"

if ! wasm-bindgen --version | grep -qx "wasm-bindgen $BINDGEN_VERSION"; then
    echo "needs: cargo install wasm-bindgen-cli --version $BINDGEN_VERSION --locked" >&2
    exit 1
fi

(cd "$ARUNA" && CARGO_PROFILE_RELEASE_OPT_LEVEL=s CARGO_PROFILE_RELEASE_LTO=true CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 \
    "${CARGO:-cargo}" build --release --locked --target wasm32-unknown-unknown -p aruna-kpabe-wasm)
rm -rf "$OUT"
wasm-bindgen --target web --out-dir "$OUT" --out-name kpabe \
    "$ARUNA/target/wasm32-unknown-unknown/release/aruna_kpabe_wasm.wasm"
cp "$ARUNA/kpabe/tests/vectors.json" "$FIXTURES/kpabe-vectors.json"
cp "$ARUNA/kpabe/wasm/tests/issue.json" "$FIXTURES/kpabe-issue.json"
cp "$ARUNA/core/tests/vectors/abe-grant.json" "$FIXTURES/abe-grant.json"
