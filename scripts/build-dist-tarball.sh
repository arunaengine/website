#!/usr/bin/env bash
# Builds the portal and packs the release artifact the aruna node consumes:
# aruna-portal-dist-<version>.tar.gz holding dist/ with a manifest.json.
# Prints the sha256 to pin in the aruna repo's portal.lock.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
MIN_API_VERSION="${ARUNA_MIN_API_VERSION:-}"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

npm run build

{
    printf '{\n'
    printf '  "portal_version": "%s",\n' "$VERSION"
    if [ -n "$MIN_API_VERSION" ]; then
        printf '  "min_api_version": "%s",\n' "$MIN_API_VERSION"
    fi
    printf '  "built_at": "%s"\n' "$BUILT_AT"
    printf '}\n'
} > dist/manifest.json

TARBALL="aruna-portal-dist-${VERSION}.tar.gz"
tar -czf "$TARBALL" dist
SHA256="$(sha256sum "$TARBALL" | cut -d' ' -f1)"

echo
echo "artifact: $ROOT/$TARBALL"
echo "version:  $VERSION"
echo "sha256:   $SHA256"
echo
echo "Pin in aruna/portal.lock:"
printf '{\n  "version": "%s",\n  "sha256": "%s",\n  "url": "<release asset url>"\n}\n' "$VERSION" "$SHA256"
