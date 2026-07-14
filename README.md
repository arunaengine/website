# Aruna Portal

The Aruna Portal is the Vue/Vite frontend for Aruna v3. It can be run locally during development or published as a static release artifact for Aruna nodes to serve in portal artifact mode.

## Requirements

- Node.js 22.12 or newer (Node.js 24 is used in CI)
- npm
- An Aruna REST API when testing authenticated portal flows
- Bash, Git, GNU tar, and gzip when creating release assets

## Development

Install dependencies:

```bash
npm ci
```

Start the Vite development server:

```bash
npm run dev
```

The development server listens on `http://localhost:5173` and proxies same-origin `/api` calls to `http://127.0.0.1:3000` by default. Override the backend target when needed:

```bash
ARUNA_PROXY_TARGET=http://127.0.0.1:3000 npm run dev
```

The server binds to loopback by default. For container, LAN, or remote development, opt into a wider bind address:

```bash
ARUNA_DEV_HOST=0.0.0.0 npm run dev
```

To bypass the development proxy and call an API URL directly, set the Vite API base URL:

```bash
VITE_ARUNA_API_BASE_URL=https://node.example.org/api/v1 npm run dev
```

## Build

Run type checking and create a production build:

```bash
npm run build
```

Production builds do not use the Vite development proxy. By default the portal calls same-origin `/api/v1`, which is suitable when Aruna serves the portal and API from the same node. To embed a direct API URL into a standalone build:

```bash
VITE_ARUNA_API_BASE_URL=https://node.example.org/api/v1 npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Release Assets

Create the same release assets locally that GitHub Actions publishes:

```bash
npm run release:assets
```

To publish an artifact that calls a direct API URL instead of same-origin `/api/v1`:

```bash
PORTAL_API_BASE_URL=https://node.example.org/api/v1 npm run release:assets
```

This command creates:

- `aruna-portal-dist.tar.gz`: static portal files at archive root, including `index.html`, `assets/`, `brand/`, and `portal-manifest.json`
- `aruna-portal-dist.tar.gz.sha256`: SHA-256 checksum for the tarball
- `portal-manifest.json`: release metadata, including the tarball SHA-256, consumed by Aruna `/api/v1/info.portal`

The standalone release manifest contains the portal name, package version, source git commit/ref, build time, source repository reference, and `artifact_sha256`. The copy inside the tarball omits `artifact_sha256` because the tarball checksum cannot be embedded inside the archive without making the checksum self-referential.

## GitHub Actions

Pull requests and pushes to the portal branches run `.github/workflows/portal-ci.yml`, which installs the committed npm lockfile with `npm ci` and runs `npm run build`.

Publish release assets with `.github/workflows/portal-release.yml`:

1. Open the `portal-release` workflow in GitHub Actions.
2. Run it manually with an existing git tag that contains the current release tooling, for example `v0.1.0-portal.2`.
3. Keep `prerelease` enabled for preview releases.
The workflow creates or updates a GitHub Release and uploads `aruna-portal-dist.tar.gz`, `aruna-portal-dist.tar.gz.sha256`, and `portal-manifest.json`. Canonical release artifacts use runtime `/portal-config.json` so they remain node-independent; direct-API builds are available only through the local command above. These stable release assets are intended to be pinned by Aruna server configuration for portal artifact mode.
