// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type {
  AnyViewFactory,
  Change,
  Entry,
  ErroredQuery,
  Format,
  Input,
  Output,
  Query,
  QueryErrorDetails,
  QueryResultDetails,
  Schema,
  TTL,
} from '@rocicorp/zero'
import type { Ref } from 'vue'
import { applyChange, skipYields } from '@rocicorp/zero/bindings'
import { ref } from 'vue'

export type QueryStatus = QueryResultDetails['type']
export type QueryError = QueryErrorDetails['error']

export class VueView implements Output {
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

    for (const node of skipYields(input.fetch({}))) {
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
    return this.#data.value['']
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

  push(change: Change) {
    this.#applyChange(change)
    return Object.freeze([])
  }

  updateTTL(ttl: TTL): void {
    this.#updateTTL(ttl)
  }
}

function makeError(error: ErroredQuery): QueryError {
  const message = error.name ?? 'An unknown error occurred'
  return {
    type: error.error,
    message,
    ...(error.details ? { details: error.details } : {}),
  }
}

export function vueViewFactory<
  TTable extends keyof TSchema['tables'] & string,
  TSchema extends Schema,
  TReturn,
>(
  _query: Query<TTable, TSchema, TReturn>,
  input: Input,
  format: Format,
  onDestroy: () => void,
  onTransactionCommit: (cb: () => void) => void,
  queryComplete: true | ErroredQuery | Promise<true>,
  updateTTL: (ttl: TTL) => void,
) {
  return new VueView(
    input,
    onTransactionCommit,
    format,
    onDestroy,
    queryComplete,
    updateTTL,
  )
}

vueViewFactory satisfies AnyViewFactory
