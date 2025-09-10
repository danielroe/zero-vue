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

Register plugin:
```js
import { createApp } from 'vue'
import { createZero } from 'zero-vue'

const app = createApp(App)
// see docs for all options: https://zero.rocicorp.dev/docs/introduction
app.use(createZero({
  userID,
  server: import.meta.env.VITE_PUBLIC_SERVER,
  schema,
  kvStore: 'mem',
}))

// With computed options:
app.use(createZero(() => ({
  userID: userID.value,
  server: import.meta.env.VITE_PUBLIC_SERVER,
  schema,
  kvStore: 'mem',
})))

// Or with a Zero instance:
app.use(createZero(new Zero({
  userID,
  server: import.meta.env.VITE_PUBLIC_SERVER,
  schema,
  kvStore: 'mem',
})))
```

Creating `useZero` composable:
```ts
import type { Mutators } from './mutators.ts'
import type { Schema } from './schema.ts'
import { createUseZero } from 'zero-vue'

// Typed:
export const useZero = createUseZero<Schema, Mutators>()

// Untyped:
export const useZero = createUseZero()
```

To query data:
```js
import { useQuery } from 'zero-vue'
import { useZero } from './use-zero.ts'

const z = useZero()
const { data: users } = useQuery(z.value.query.user)
```

> [!TIP]
> See [the playground](./playground) for a full working example based on [rocicorp/hello-zero](https://github.com/rocicorp/hello-zero), or check out [danielroe/hello-zero-nuxt](https://github.com/danielroe/hello-zero-nuxt) to see how to set things up with [Nuxt](https://nuxt.com/).

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

[npm-version-src]: https://img.shields.io/npm/v/zero-vue?style=flat-square
[npm-version-href]: https://npmjs.com/package/zero-vue
[npm-downloads-src]: https://img.shields.io/npm/dm/zero-vue?style=flat-square
[npm-downloads-href]: https://npm.chart.dev/zero-vue
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/danielroe/zero-vue/ci.yml?branch=main&style=flat-square
[github-actions-href]: https://github.com/danielroe/zero-vue/actions?query=workflow%3Aci
[codecov-src]: https://img.shields.io/codecov/c/gh/danielroe/zero-vue/main?style=flat-square
[codecov-href]: https://codecov.io/gh/danielroe/zero-vue
