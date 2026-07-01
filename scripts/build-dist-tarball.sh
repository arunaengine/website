#!/usr/bin/env bash
# Builds the portal release assets consumed by Aruna artifact mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARBALL="aruna-portal-dist.tar.gz"
SHA_FILE="${TARBALL}.sha256"
MANIFEST="portal-manifest.json"

rm -f "$TARBALL" "$SHA_FILE" "$MANIFEST"
if [ -z "${PORTAL_PACKAGE_RUNNER:-}" ]; then
    if command -v bun >/dev/null 2>&1; then
        PORTAL_PACKAGE_RUNNER="bun"
    else
        PORTAL_PACKAGE_RUNNER="npm"
    fi
fi

if [ -n "${PORTAL_API_BASE_URL:-}" ] && [ -z "${VITE_ARUNA_API_BASE_URL:-}" ]; then
    export VITE_ARUNA_API_BASE_URL="$PORTAL_API_BASE_URL"
fi

"$PORTAL_PACKAGE_RUNNER" run build

if command -v bun >/dev/null 2>&1; then
    VERSION="$(bun --print "require('./package.json').version")"
else
    VERSION="$(node -p "require('./package.json').version")"
fi
GIT_COMMIT="${GITHUB_SHA:-$(git rev-parse HEAD)}"
GIT_REF="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SOURCE="${PORTAL_SOURCE:-ArunaStorage/website@${GIT_REF}}"

json_escape() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    value="${value//$'\n'/\\n}"
    printf '%s' "$value"
}

{
    printf '{\n'
    printf '  "name": "aruna-portal",\n'
    printf '  "version": "%s",\n' "$(json_escape "$VERSION")"
    printf '  "git_commit": "%s",\n' "$(json_escape "$GIT_COMMIT")"
    printf '  "git_ref": "%s",\n' "$(json_escape "$GIT_REF")"
    printf '  "built_at": "%s",\n' "$(json_escape "$BUILT_AT")"
    printf '  "source": "%s"\n' "$(json_escape "$SOURCE")"
    printf '}\n'
} > "$MANIFEST"
cp "$MANIFEST" "dist/$MANIFEST"

tar -C dist -czf "$TARBALL" .
sha256sum "$TARBALL" > "$SHA_FILE"

echo "artifact=$ROOT/$TARBALL"
echo "checksum=$ROOT/$SHA_FILE"
echo "manifest=$ROOT/$MANIFEST"
