# Aruna Portal

The Aruna Portal is the Vue/Vite frontend for Aruna v3. It can be run locally during development or published as a static release artifact for Aruna nodes to serve in portal artifact mode.

## Requirements

- Bun 1.2 or newer
- An Aruna REST API when testing authenticated portal flows

## Development

Install dependencies:

```bash
bun install
```

Start the Vite development server:

```bash
bun run dev
```

The development server listens on `http://localhost:5173` and proxies same-origin `/api` calls to `http://127.0.0.1:3000` by default. Override the backend target when needed:

```bash
ARUNA_PROXY_TARGET=http://127.0.0.1:3000 bun run dev
```

To bypass the development proxy and call an API URL directly, set the Vite API base URL:

```bash
VITE_ARUNA_API_BASE_URL=https://node.example.org/api/v1 bun run dev
```

## Build

Run type checking and create a production build:

```bash
bun run build
```

Production builds do not use the Vite development proxy. By default the portal calls same-origin `/api/v1`, which is suitable when Aruna serves the portal and API from the same node. To embed a direct API URL into a standalone build:

```bash
VITE_ARUNA_API_BASE_URL=https://node.example.org/api/v1 bun run build
```

Preview the production build locally:

```bash
bun run preview
```

## Release Assets

Create the same release assets locally that GitHub Actions publishes:

```bash
bun run release:assets
```

To publish an artifact that calls a direct API URL instead of same-origin `/api/v1`:

```bash
PORTAL_API_BASE_URL=https://node.example.org/api/v1 bun run release:assets
```

This command creates:

- `aruna-portal-dist.tar.gz`: static portal files at archive root, including `index.html`, `assets/`, `brand/`, and `portal-manifest.json`
- `aruna-portal-dist.tar.gz.sha256`: SHA-256 checksum for the tarball
- `portal-manifest.json`: release metadata consumed by Aruna `/api/v1/info.portal`

The manifest contains the portal name, package version, source git commit/ref, build time, and source repository reference.

## GitHub Actions

Pull requests and pushes to the portal branches run `.github/workflows/portal-ci.yml`, which installs dependencies with Bun and runs `bun run build`.

Publish release assets with `.github/workflows/portal-release.yml`:

1. Open the `portal-release` workflow in GitHub Actions.
2. Run it manually with a release tag, for example `v0.1.0-portal.1`.
3. Keep `prerelease` enabled for preview releases.
4. Optionally set `api_base_url` to embed a direct API URL such as `https://node.example.org/api/v1`; leave it empty for same-origin `/api/v1`.

The workflow creates or updates a GitHub Release and uploads `aruna-portal-dist.tar.gz`, `aruna-portal-dist.tar.gz.sha256`, and `portal-manifest.json`. These stable release assets are intended to be pinned by Aruna server configuration for portal artifact mode.
