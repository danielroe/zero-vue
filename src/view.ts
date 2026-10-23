// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type {
  AnyViewFactory,
  Change,
  Entry,
  ErroredQuery,
  Format,
  Input,
  Node,
  Output,
  Query,
  QueryErrorDetails,
  QueryResultDetails,
  Schema,
  Stream,
  TTL,
} from '@rocicorp/zero'
import type { ViewChange } from '@rocicorp/zero/bindings'
import type { ShallowRef } from 'vue'
import { applyChange, skipYields } from '@rocicorp/zero/bindings'
import { shallowRef } from 'vue'

export type QueryStatus = QueryResultDetails['type']
export type QueryError = QueryErrorDetails['error']

interface ViewSnapshot {
  root: Entry
  status: QueryStatus
  error: QueryError | undefined
}

export class VueView implements Output {
  readonly #input: Input
  readonly #format: Format
  readonly #onDestroy: () => void
  readonly #updateTTL: (ttl: TTL) => void

  #root: Entry
  #snapshot: ShallowRef<ViewSnapshot>
  #status: QueryStatus
  #error: QueryError | undefined
  #dirty = false
  #held = false
  #released = false
  #isDestroyed = false
  #txnDirty = new WeakSet<object>()

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
    this.#root = { '': format.singular ? undefined : [] }
    this.#status = queryComplete === true ? 'complete' : 'error' in queryComplete ? 'error' : 'unknown'
    this.#error = queryComplete !== true && 'error' in queryComplete ? makeError(queryComplete) : undefined
    this.#snapshot = shallowRef({ root: this.#root, status: this.#status, error: this.#error })

    input.setOutput(this)

    for (const node of skipYields(input.fetch({}))) {
      this.#applyChange({ type: 'add', node }, true)
    }

    this.#dirty = true
    this.#flush()

    onTransactionCommit(() => this.#flush())

    if (queryComplete !== true && !('error' in queryComplete)) {
      void queryComplete.then(() => {
        this.#setStatus('complete')
      }).catch((error: ErroredQuery) => {
        this.#setStatus('error', makeError(error))
      })
    }
  }

  get data(): Entry[string] {
    const snapshot = this.#snapshot.value
    return (this.#released ? this.#root : snapshot.root)['']
  }

  get status(): QueryStatus {
    const snapshot = this.#snapshot.value
    return this.#released ? this.#status : snapshot.status
  }

  get error(): QueryError | undefined {
    const snapshot = this.#snapshot.value
    return this.#released ? this.#error : snapshot.error
  }

  destroy(): void {
    if (!this.#isDestroyed) {
      this.#isDestroyed = true
      this.#onDestroy()
    }
  }

  #applyChange(change: ViewChange, mutate: boolean | WeakSet<object> = this.#txnDirty): void {
    const root = applyChange(
      this.#root,
      change,
      this.#input.getSchema(),
      '',
      this.#format,
      false,
      mutate,
    )
    if (root !== this.#root) {
      this.#root = root
      this.#dirty = true
    }
  }

  push(change: Change): readonly never[] {
    this.#applyChange(materializeRelationships(change))
    return Object.freeze([])
  }

  updateTTL(ttl: TTL): void {
    this.#updateTTL(ttl)
  }

  markCached(): void {
    if (this.#status === 'unknown') {
      this.#setStatus('cached')
    }
  }

  unmarkCached(): void {
    if (this.#status === 'cached') {
      this.#setStatus('unknown')
    }
  }

  holdData(): void {
    // Rows already wait for commit; hold result details through hydration too.
    this.#held = true
    this.#released = false
  }

  releaseData(): void {
    // Zero releases every view in a hydration batch before committing any of
    // them. Make all snapshots readable without notifying observers yet.
    this.#released = true
  }

  #setStatus(status: QueryStatus, error?: QueryError): void {
    this.#status = status
    this.#error = error
    if (this.#held || this.#dirty) {
      this.#dirty = true
    }
    else {
      this.#publish()
    }
  }

  #flush(): void {
    this.#held = false
    this.#released = false
    if (!this.#dirty) {
      return
    }
    this.#dirty = false
    this.#publish()
  }

  #publish(): void {
    // Reset ownership before sync watchers can push another transaction, and
    // publish rows and result details together so those watchers see one state.
    this.#txnDirty = new WeakSet<object>()
    this.#snapshot.value = { root: this.#root, status: this.#status, error: this.#error }
  }
}

function materializeRelationships(change: Change): ViewChange {
  switch (change[0]) {
    case 0:
      return {
        type: 'add',
        node: materializeNodeRelationships(change[1]),
      }
    case 1:
      return {
        type: 'remove',
        node: materializeNodeRelationships(change[1]),
      }
    case 2:
      return {
        type: 'edit',
        node: { row: change[1].row },
        oldNode: { row: change[2].row },
      }
    case 3:
      return {
        type: 'child',
        node: { row: change[1].row },
        child: {
          relationshipName: change[2].relationshipName,
          change: materializeRelationships(change[2].change),
        },
      }
  }
}

function materializeNodeRelationships(node: Node): Node {
  const relationships: Record<string, () => Stream<Node>> = {}

  for (const relationship in node.relationships) {
    const children = node.relationships[relationship]
    if (!children) {
      continue
    }

    const materialized: Node[] = []

    for (const child of skipYields(children())) {
      materialized.push(materializeNodeRelationships(child))
    }

    relationships[relationship] = () => materialized
  }

  return {
    row: node.row,
    relationships,
  }
}

function makeError(error: ErroredQuery): QueryError {
  const message = error.message ?? 'An unknown error occurred'
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
): VueView {
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
