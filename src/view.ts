// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type {
  Change,
  Entry,
  Format,
  HumanReadable,
  Input,
  Output,
  Query,
  ResultType,
  Schema,
  TTL,
  ViewFactory,
} from '@rocicorp/zero'
import { applyChange } from '@rocicorp/zero'
import { reactive } from 'vue'

interface QueryResultDetails {
  readonly type: ResultType
}

type State = [Entry, QueryResultDetails]

const complete = { type: 'complete' } as const
const unknown = { type: 'unknown' } as const

export class VueView<V> implements Output {
  readonly #input: Input
  readonly #format: Format
  readonly #onDestroy: () => void
  readonly #updateTTL: (ttl: TTL) => void

  #state: State

  constructor(
    input: Input,
    onTransactionCommit: (cb: () => void) => void,
    format: Format = { singular: false, relationships: {} },
    onDestroy: () => void = () => {},
    queryComplete: true | Promise<true>,
    updateTTL: (ttl: TTL) => void,
  ) {
    this.#input = input
    this.#format = format
    this.#onDestroy = onDestroy
    this.#updateTTL = updateTTL
    this.#state = reactive([
      { '': format.singular ? undefined : [] },
      queryComplete === true ? complete : unknown,
    ])
    input.setOutput(this)

    for (const node of input.fetch({})) {
      this.#applyChange({ type: 'add', node })
    }

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

  #applyChange(change: Change): void {
    applyChange(
      this.#state[0],
      change,
      this.#input.getSchema(),
      '',
      this.#format,
    )
  }

  push(change: Change): void {
    this.#applyChange(change)
  }

  updateTTL(ttl: TTL): void {
    this.#updateTTL(ttl)
  }
}

export function vueViewFactory<
  TSchema extends Schema,
  TTable extends keyof TSchema['tables'] & string,
  TReturn,
>(
  query: Query<TSchema, TTable, TReturn>,
  input: Input,
  format: Format,
  onDestroy: () => void,
  onTransactionCommit: (cb: () => void) => void,
  queryComplete: true | Promise<true>,
  updateTTL?: (ttl: TTL) => void,
) {
  interface UpdateTTL {
    updateTTL: (ttl: TTL) => void
  }
  return new VueView<HumanReadable<TReturn>>(
    input,
    onTransactionCommit,
    format,
    onDestroy,
    queryComplete,
    // In zero@0.19 updateTTL is passed in to the view factory.
    // In zero@0.18 it was a property on the query.
    updateTTL ?? (ttl =>
      (query as unknown as UpdateTTL).updateTTL(ttl)
    ),
  )
}

vueViewFactory satisfies ViewFactory<Schema, string, unknown, unknown>
