// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { ResultType, Schema } from '@rocicorp/zero'
import type { Change, Entry, Format, HumanReadable, Input, Output, Query, ViewFactory } from '@rocicorp/zero/advanced'
import { applyChange } from '@rocicorp/zero/advanced'
import { reactive } from 'vue'

interface QueryResultDetails {
  readonly type: ResultType
}

type State = [Entry, QueryResultDetails]

const complete = { type: 'complete' } as const
const unknown = { type: 'unknown' } as const

class VueView<V> implements Output {
  readonly #input: Input
  readonly #format: Format
  readonly #onDestroy: () => void

  #state: State

  #pendingChanges: Change[] = []

  constructor(
    input: Input,
    onTransactionCommit: (cb: () => void) => void,
    format: Format = { singular: false, relationships: {} },
    onDestroy: () => void = () => {},
    queryComplete: true | Promise<true>,
  ) {
    this.#input = input
    onTransactionCommit(this.#onTransactionCommit)
    this.#format = format
    this.#onDestroy = onDestroy
    this.#state = reactive([
      { '': format.singular ? undefined : [] },
      queryComplete === true ? complete : unknown,
    ])
    input.setOutput(this)

    this.#applyChanges(input.fetch({}), node => ({ type: 'add', node }))

    if (queryComplete !== true) {
      void queryComplete.then(() => {
        this.#state[1] = complete
      })
    }
  }

  get data() {
    return this.#state[0][''] as V
  }

  get status() {
    return this.#state[1].type
  }

  destroy() {
    this.#onDestroy()
  }

  #onTransactionCommit = () => {
    this.#applyChanges(this.#pendingChanges, c => c)
  }

  #applyChanges<T>(changes: Iterable<T>, mapper: (v: T) => Change): void {
    try {
      for (const change of changes) {
        applyChange(
          this.#state[0],
          mapper(change),
          this.#input.getSchema(),
          '',
          this.#format,
        )
      }
    }
    finally {
      this.#pendingChanges = []
    }
  }

  push(change: Change): void {
    // Delay setting the state until the transaction commit.
    this.#pendingChanges.push(change)
  }
}

export function vueViewFactory<
  TSchema extends Schema,
  TTable extends keyof TSchema['tables'] & string,
  TReturn,
>(
  _query: Query<TSchema, TTable, TReturn>,
  input: Input,
  format: Format,
  onDestroy: () => void,
  onTransactionCommit: (cb: () => void) => void,
  queryComplete: true | Promise<true>,
) {
  return new VueView<HumanReadable<TReturn>>(
    input,
    onTransactionCommit,
    format,
    onDestroy,
    queryComplete,
  )
}

vueViewFactory satisfies ViewFactory<Schema, string, unknown, unknown>
