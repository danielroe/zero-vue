// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type {
  Change,
  Entry,
  Format,
  HumanReadable,
  Input,
  Output,
  Query,
  ReadonlyJSONValue,
  Schema,
  TTL,
  ViewFactory,
} from '@rocicorp/zero'
import type { Ref } from 'vue'
import { applyChange } from '@rocicorp/zero'
import { ref } from 'vue'

// zero does not export this type
type ErroredQuery = {
  error: 'app'
  queryName: string
  details: ReadonlyJSONValue
} | {
  error: 'zero'
  queryName: string
  details: ReadonlyJSONValue
} | {
  error: 'http'
  queryName: string
  status: number
  details: ReadonlyJSONValue
}

export type QueryStatus = 'complete' | 'unknown' | 'error'

export type QueryError = {
  type: 'app'
  queryName: string
  details: ReadonlyJSONValue
} | {
  type: 'http'
  queryName: string
  status: number
  details: ReadonlyJSONValue
}

export class VueView<V> implements Output {
  readonly #input: Input
  readonly #format: Format
  readonly #onDestroy: () => void
  readonly #updateTTL: (ttl: TTL) => void

  #data: Ref<Entry>
  #status: Ref<QueryStatus>
  #error: Ref<QueryError | undefined>

  constructor(
    input: Input,
    onTransactionCommit: (cb: () => void) => void,
    format: Format,
    onDestroy: () => void = () => {},
    queryComplete: true | ErroredQuery | Promise<true>,
    updateTTL: (ttl: TTL) => void,
  ) {
    this.#input = input
    this.#format = format
    this.#onDestroy = onDestroy
    this.#updateTTL = updateTTL
    this.#data = ref({ '': format.singular ? undefined : [] })
    this.#status = ref(queryComplete === true ? 'complete' : 'error' in queryComplete ? 'error' : 'unknown')
    this.#error = ref(queryComplete !== true && 'error' in queryComplete ? makeError(queryComplete) : undefined) as Ref<QueryError | undefined>

    input.setOutput(this)

    for (const node of input.fetch({})) {
      this.#applyChange({ type: 'add', node })
    }

    if (queryComplete !== true && !('error' in queryComplete)) {
      void queryComplete.then(() => {
        this.#status.value = 'complete'
        this.#error.value = undefined
      }).catch((error: ErroredQuery) => {
        this.#status.value = 'error'
        this.#error.value = makeError(error)
      })
    }
  }

  get data() {
    return this.#data.value[''] as V
  }

  get status() {
    return this.#status.value
  }

  get error() {
    return this.#error.value
  }

  destroy() {
    this.#onDestroy()
  }

  #applyChange(change: Change): void {
    applyChange(
      this.#data.value,
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

function makeError(error: ErroredQuery): QueryError {
  return error.error === 'app' || error.error === 'zero'
    ? {
        type: 'app',
        queryName: error.queryName,
        details: error.details,
      }
    : {
        type: 'http',
        queryName: error.queryName,
        status: error.status,
        details: error.details,
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
  queryComplete: true | ErroredQuery | Promise<true>,
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
