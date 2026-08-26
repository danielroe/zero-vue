# zero-vue

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> Vue bindings for [Zero](https://zero.rocicorp.dev/)

## Usage

Install package:

```sh
# npm
npm install zero-vue

# pnpm
pnpm install zero-vue
```

Creating `useZero` and `useQuery` composables:
```ts
import { createZeroComposables } from 'zero-vue'
import { mutators } from './mutators.ts'
import { schema } from './schema.ts'

// see docs for all options: https://zero.rocicorp.dev/docs/introduction
const { useZero, useQuery } = createZeroComposables({
  userID,
  server: import.meta.env.VITE_PUBLIC_SERVER,
  schema,
  mutators,
  kvStore: 'mem',
})

// OR with computed options:
const { useZero, useQuery } = createZeroComposables(() => ({
  userID: userID.value,
  server: import.meta.env.VITE_PUBLIC_SERVER,
  schema,
  mutators,
  kvStore: 'mem',
}))

// OR with a Zero instance:
const { useZero, useQuery } = createZeroComposables({
  zero: new Zero({
    userID,
    server: import.meta.env.VITE_PUBLIC_SERVER,
    schema,
    mutators,
    kvStore: 'mem',
  }),
})
```

To query data:
```js
import { useQuery, useZero } from './use-zero.ts'

const zero = useZero()
const { data: users } = useQuery(() => zero.value.query.user)
```

> [!TIP]
> See [the Vue fixture](./test/fixtures/vue) or [the Nuxt fixture](./test/fixtures/nuxt) for full working examples based on [rocicorp/hello-zero](https://github.com/rocicorp/hello-zero).

## Nuxt

A Nuxt module ships with `zero-vue`. It handles common SSR pain points automatically: composables are scoped per request, the server-side Zero instance is closed after render, and an SSR-aware query composable is provided.

Add the module:

```ts
export default defineNuxtConfig({
  modules: ['zero-vue'],
})
```

Create a `zero.config.ts` in your `app/` directory with a default export of `defineZeroOptions`. It accepts the same argument as `createZeroComposables`, and a getter can use Nuxt composables like `useCookie` and `useRuntimeConfig`:

```ts
import { defineZeroOptions } from 'zero-vue'
import { useCookie, useRuntimeConfig } from '#imports'
import { mutators, schema } from './db/schema'

export default defineZeroOptions(() => {
  const config = useRuntimeConfig()
  return {
    userID: useCookie('userID').value ?? undefined,
    cacheURL: config.public.zero.cacheURL || undefined,
    schema,
    mutators,
    kvStore: 'mem',
  }
})
```

The module then auto-imports fully-typed composables (typed from the schema and mutators in your `zero.config.ts`):

- `useZero()` — the request-scoped `Zero` instance
- `useQuery(query, options?)` — reactive query view
- `useConnectionState()` — readonly connection state
- `useZeroSsrQuery(key, query)` — `useAsyncData`-backed query so data is present in the SSR payload, handed over to the live view once the client has synced
- `useZeroComposables()` — the whole request-scoped bundle, if you need to pass it around

It also seeds `runtimeConfig.public.zero` with `cacheURL`, `queryURL` and `mutateURL`, so you can configure them from module options (the `zero` key in `nuxt.config`) or environment variables (`NUXT_PUBLIC_ZERO_CACHE_URL`, `NUXT_PUBLIC_ZERO_QUERY_URL`, `NUXT_PUBLIC_ZERO_MUTATE_URL`) without any boilerplate.

By default the server never opens a websocket to zero-cache: any `cacheURL`/`server` in your zero options is stripped during SSR, so `useZeroSsrQuery` falls back to an empty SSR payload and the client syncs after hydration. Set `zero: { ssr: true }` in `nuxt.config` to let the per-request server-side Zero instance connect and pre-fetch (it is closed automatically after render).

## SSR

Zero is designed for the browser: it opens a WebSocket to `zero-cache`, keeps a local replica in IndexedDB or in-memory, and exposes a reactive view. None of that is straightforward with server-rendering, so there are a few pain points to be aware of when wiring `zero-vue` into an SSR framework. In Nuxt, [the module above](#nuxt) handles these automatically; the notes below apply if you're wiring things up by hand.

**Scope `createZeroComposables` per request.** The composables returned by `createZeroComposables` close over a single `Zero` instance. If you call it at module scope, every SSR request will share that instance (and its `userID`, its local data, and its WebSocket). Cache the composables on `useNuxtApp()` instead, and close the instance once the response has rendered:

```ts
function createComposables() {
  return createZeroComposables(() => ({
    userID,
    cacheURL: useRuntimeConfig().public.zero.cacheURL || undefined,
    schema,
    mutators,
    kvStore: 'mem',
  }))
}

declare module '#app' {
  interface NuxtApp {
    _zeroComposables?: ReturnType<typeof createComposables>
  }
}

function getZeroComposables() {
  const nuxt = useNuxtApp()
  if (!nuxt._zeroComposables) {
    nuxt._zeroComposables = createComposables()
    if (import.meta.server) {
      nuxt.hooks.hookOnce('app:rendered', () => {
        const zero = nuxt._zeroComposables?.useZero().value
        if (zero && !zero.closed) {
          void zero.close()
        }
      })
    }
  }
  return nuxt._zeroComposables
}
```

**`useQuery` will not have data ready during render.** `useQuery` returns a reactive view that fills in once the underlying query has synced from `zero-cache`. The first synchronous render (which is what SSR uses) sees an empty array. If you want SSR-rendered data, return a `useAsyncData` fetch of `zero.run(query, { type: 'complete' })` and hand `data` over to the live view once it has synced on the client:

```ts
export function useZeroSsrQuery(key, query) {
  const zero = useZero()
  const { data: liveRows, status } = useQuery(query)

  const asyncData = useAsyncData(`zero:${key}`, async () => {
    if (!zero.value.server) {
      return []
    }
    return await zero.value.run(query, { type: 'complete' })
  }, {
    default: () => [],
    // Zero rows carry a symbol-keyed refcount property that the Nuxt payload
    // serialiser rejects; strip it before it is serialised.
    transform: rows => JSON.parse(JSON.stringify(rows)),
  })

  if (import.meta.client) {
    watch([liveRows, status], ([rows, status]) => {
      if (status === 'complete') {
        asyncData.data.value = rows
      }
    }, { immediate: true })
  }

  return asyncData
}

const { data: users } = await useZeroSsrQuery('users', () => queries.users.all())
```

**Leave `cacheURL` unset if you don't want a server-side WebSocket.** Zero detects the absence of `WebSocket` in the global scope and skips the connect loop, so older Node runtimes are fine. Node 22+ exposes a real `WebSocket` global, so `new Zero({ cacheURL: 'http://...' })` will happily try to connect from the server. Leave `cacheURL` unset on environments where the server shouldn't pre-fetch via Zero (and close the instance after render if you do set it, as above).

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## Credits

The implementation here was based on [zero-solid](https://github.com/rocicorp/mono/tree/main/packages/zero-solid). You can also check out [hello-zero-nuxt](https://github.com/danielroe/hello-zero-nuxt) to see the original implementation and history of this project.

## License

Made with ❤️

Published under [MIT License](./LICENCE).

<!-- Badges -->

[npm-version-src]: https://npmx.dev/api/registry/badge/version/zero-vue
[npm-version-href]: https://npmx.dev/package/zero-vue
[npm-downloads-src]: https://npmx.dev/api/registry/badge/downloads/zero-vue
[npm-downloads-href]: https://npm.chart.dev/zero-vue
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/danielroe/zero-vue/ci.yml?branch=main&style=flat-square
[github-actions-href]: https://github.com/danielroe/zero-vue/actions?query=workflow%3Aci
[codecov-src]: https://img.shields.io/codecov/c/gh/danielroe/zero-vue/main?style=flat-square
[codecov-href]: https://codecov.io/gh/danielroe/zero-vue
