# ArunaWeb 5.0

This is another total revised version for the Aruna website. Powered by [Vue 3](https://vuejs.org/), [Nuxt 3](https://nuxt.com/), [Tailwind CSS](https://tailwindcss.com/) and [shadcn-vue](https://www.shadcn-vue.com/). 

This version is intended to be used with version **3.x.x** of Aruna, so to start a local test instance, you need a running Aruna instance and a running API Gateway to translate the RESTful http calls into native gRPC for the Aruna server.

1. How to start a local Aruna instance is described in the [Getting started instructions of the Aruna main repository](https://github.com/arunaengine/aruna?tab=readme-ov-file#getting-started) which guides you through the individual steps.

2. How to start the Aruna API-Gateway for a local instance is described in the [Configuration parameters section of the API-Gateway repository](https://github.com/arunaengine/grpc-gateway?tab=readme-ov-file#configuration-parameters).

## Website Setup

* Install the Bun JavaScript runtime & toolkit following the instructions on [Bun.sh](https://bun.sh/)

* Make sure to install the project dependencies with `bun install` or short `bun i` 

## Website Development Server

Start the development server on `http://localhost:3000`: `bun run dev`.

## Website Production Build

Build the application for production: `bun run build`

Locally preview production build on `http://localhost:3000`: `bun run preview`

## Build Website Container

You can build the container either with Podman oder Docker:

* Podman: `podman build . -f Dockerfile -t aruna-web`
* Docker: `docker build . -f Dockerfile -t aruna-web`

## Further Information

You can also take a look at the [Bun documentation](https://bun.sh/docs), [Vue 3 documentation](https://vuejs.org/guide/introduction.html) and/or [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more about the technical background of the frameworks used.
