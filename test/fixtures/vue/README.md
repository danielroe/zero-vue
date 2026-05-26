This is a quick port of https://github.com/rocicorp/hello-zero to use Vue. For a Nuxt example, see [`../nuxt`](../nuxt).

## Run this repo

First, install dependencies:

```sh
corepack enable
pnpm i
```

Next, run docker:

```sh
pnpm dev:db-up
```

**In a second terminal**, run the zero cache server:

```sh
pnpm dev:zero-cache
```

**In a third terminal**, run the Vite dev server:

```sh
pnpm dev:ui
```

## ❤️ Credits

This was based on https://github.com/rocicorp/hello-zero.

## 🏛️ License

Made with ❤️

Published under [MIT License](../../../LICENCE).
