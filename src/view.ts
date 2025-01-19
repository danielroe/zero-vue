// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { Change, Entry, Format, Input, Output, Query, QueryType, Smash, TableSchema, View, ViewFactory } from '@rocicorp/zero/advanced'
import { applyChange } from '@rocicorp/zero/advanced'
import { reactive } from 'vue'

export type ResultType = 'complete' | 'unknown'

export class VueView<V extends View> implements Output {
  readonly #input: Input
  readonly #format: Format
  readonly #onDestroy: () => void

  // Synthetic "root" entry that has a single "" relationship, so that we can
  // treat all changes, including the root change, generically.
  readonly #root: Entry
  readonly #resultType: { resultType: ResultType }

  constructor(
    input: Input,
    format: Format = { singular: false, relationships: {} },
    onDestroy: () => void = () => {},
    queryComplete: true | Promise<true> = true,
  ) {
    this.#input = input
    this.#format = format
    this.#onDestroy = onDestroy
    this.#root = reactive({
      '': format.singular ? undefined : [],
    })
    this.#resultType = reactive({
      resultType: queryComplete === true ? 'complete' : 'unknown',
    })
    input.setOutput(this)

    for (const node of input.fetch({})) {
      applyChange(
        this.#root,
        { type: 'add', node },
        input.getSchema(),
        '',
        this.#format,
      )
    }
    if (queryComplete !== true) {
      void queryComplete.then(() => {
        this.#resultType.resultType = 'complete'
      })
    }
  }

  get data() {
    return this.#root[''] as V
  }

  get resultType() {
    return this.#resultType.resultType
  }

  destroy() {
    this.#onDestroy()
  }

  push(change: Change): void {
    applyChange(
      this.#root,
      change,
      this.#input.getSchema(),
      '',
      this.#format,
    )
  }
}

export function vueViewFactory<
  TSchema extends TableSchema,
  TReturn extends QueryType,
>(
  _query: Query<TSchema, TReturn>,
  input: Input,
  format: Format,
  onDestroy: () => void,
  _onTransactionCommit: (cb: () => void) => void,
  queryComplete: true | Promise<true>,
): VueView<Smash<TReturn>> {
  const v = new VueView<Smash<TReturn>>(input, format, onDestroy, queryComplete)

  return v
}

vueViewFactory satisfies ViewFactory<TableSchema, QueryType, unknown>
