# ArunaWeb 3.0

This is a total revised web version for the Aruna Object Storage website. Powered by [tabler.io](https://tabler.io/), [Bootstrap 5](https://getbootstrap.com/), Rust + Wasm via [Leptos](https://github.com/leptos-rs/leptos).
For now only an experimental rudimentary version is available, this will be expanded further.

The web version is a fully integrated website + webserver version including SSR + hydration.


## Getting started

- Install [rustup](https://rustup.rs/)
- Add nightly toolchain and wasm32 target:

```
rustup toolchain install nightly
rustup default nightly
rustup target add wasm32-unknown-unknown
```

- Install cargo leptos `cargo install cargo-leptos`
- Run the development webserver with `cargo leptos watch`
- The website will be available on `localhost:3000`