# ArunaWeb 5.0

This is another total revised web version for the Aruna website. Powered by [Vue 3](https://vuejs.org/), [Nuxt 3](https://nuxt.com/), [Tailwind CSS](https://tailwindcss.com/) and [Preline](https://preline.co/). 

This version is intended to be used with version **2.x.x** of Aruna, so to start a local test instance, you need a running Aruna instance and a running API Gateway to translate the RESTful http calls into native gRPC for the Aruna server.

1. How to start a local Aruna instance is described in the [Getting started instructions of the Aruna main repository](https://github.com/ArunaStorage/aruna?tab=readme-ov-file#getting-started) which guides you through the individual steps.

2. How to start the Aruna API-Gateway for a local instance is described in the [Configuration parameters section of the API-Gateway repository](https://github.com/ArunaStorage/grpc-gateway?tab=readme-ov-file#configuration-parameters).

## Website Setup

Make sure to install the dependencies:

```bash
# npm
npm install
# pnpm
pnpm install
# yarn
yarn install
# bun
bun install
```

## Website Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev
# pnpm
pnpm run dev
# yarn
yarn dev
# bun
bun run dev
```

## Website Production Build

Build the application for production:

```bash
# npm
npm run build
# pnpm
pnpm run build
# yarn
yarn build
# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview
# pnpm
pnpm run preview
# yarn
yarn preview
# bun
bun run preview
```

You can also have a look at the [Vue 3 documentation](https://vuejs.org/guide/introduction.html) and [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more about the technical background of the used frameworks.
