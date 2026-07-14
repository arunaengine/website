#!/usr/bin/env bash
# Builds the portal release assets consumed by Aruna artifact mode.
set -euo pipefail
PACKAGER_VERSION=2

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARBALL="aruna-portal-dist.tar.gz"
SHA_FILE="${TARBALL}.sha256"
MANIFEST="portal-manifest.json"

rm -f "$TARBALL" "$SHA_FILE" "$MANIFEST"
PORTAL_PACKAGE_RUNNER="${PORTAL_PACKAGE_RUNNER:-npm}"

if [ -n "${PORTAL_API_BASE_URL:-}" ] && [ -z "${VITE_ARUNA_API_BASE_URL:-}" ]; then
    export VITE_ARUNA_API_BASE_URL="$PORTAL_API_BASE_URL"
fi

"$PORTAL_PACKAGE_RUNNER" run build

EXACT_TAG="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
VERSION="${PORTAL_VERSION:-${EXACT_TAG:-$(node -p "require('./package.json').version")}}"
VERSION="${VERSION#v}"
GIT_COMMIT="${PORTAL_GIT_COMMIT:-$(git rev-parse HEAD)}"
GIT_REF="${PORTAL_GIT_REF:-${GITHUB_REF_NAME:-${EXACT_TAG:-$(git rev-parse --abbrev-ref HEAD)}}}"
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    GIT_REF="${GIT_REF}-dirty"
fi
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git show -s --format=%ct "$GIT_COMMIT")}"
BUILT_AT="$(node -e "process.stdout.write(new Date(Number(process.argv[1]) * 1000).toISOString().replace('.000Z', 'Z'))" "$SOURCE_DATE_EPOCH")"
SOURCE="${PORTAL_SOURCE:-arunaengine/website@${GIT_REF}}"

json_escape() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    value="${value//$'\n'/\\n}"
    printf '%s' "$value"
}

write_manifest() {
    local artifact_sha256="${1:-}"
    {
        printf '{\n'
        printf '  "name": "aruna-portal",\n'
        printf '  "version": "%s",\n' "$(json_escape "$VERSION")"
        printf '  "git_commit": "%s",\n' "$(json_escape "$GIT_COMMIT")"
        printf '  "git_ref": "%s",\n' "$(json_escape "$GIT_REF")"
        printf '  "built_at": "%s",\n' "$(json_escape "$BUILT_AT")"
        printf '  "source": "%s"' "$(json_escape "$SOURCE")"
        if [ -n "$artifact_sha256" ]; then
            printf ',\n'
            printf '  "artifact_sha256": "%s"\n' "$(json_escape "$artifact_sha256")"
        else
            printf '\n'
        fi
        printf '}\n'
    } > "$MANIFEST"
}

write_manifest
cp "$MANIFEST" "dist/$MANIFEST"

LC_ALL=C tar --sort=name --mtime="@${SOURCE_DATE_EPOCH}" --owner=0 --group=0 --numeric-owner --mode='a=rX,u+w' -C dist -cf - . | gzip -n > "$TARBALL"
ARTIFACT_SHA256="$(node -e "const fs=require('fs'),crypto=require('crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$TARBALL")"
printf '%s  %s\n' "$ARTIFACT_SHA256" "$TARBALL" > "$SHA_FILE"
write_manifest "$ARTIFACT_SHA256"

echo "artifact=$ROOT/$TARBALL"
echo "checksum=$ROOT/$SHA_FILE"
echo "manifest=$ROOT/$MANIFEST"
