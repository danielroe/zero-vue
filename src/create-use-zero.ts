import type { CustomMutatorDefs, Schema, Zero } from '@rocicorp/zero'
import type { ShallowRef } from 'vue'
import { inject } from 'vue'
import { zeroSymbol } from './create-zero'

export function createUseZero<
  S extends Schema,
  MD extends CustomMutatorDefs | undefined = undefined,
>() {
  return () => inject(zeroSymbol) as ShallowRef<Zero<S, MD>>
}
