import type {
  CustomMutatorDefs,
  DefaultContext,
  DefaultSchema,
  PullRow,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Schema,
} from '@rocicorp/zero'
import type { MaybeRefOrGetter } from 'vue'
import type { QueryResult, UseQueryOptions } from './query'
import type { ZeroSource } from './types'
import { toValue, watch } from 'vue'
import { isZeroSourceArg } from './context'
import { useQuery } from './query'

export interface UseSuspenseQueryOptions extends UseQueryOptions {
  /**
   * How much of the result to wait for:
   *
   * - `partial`: resolve as soon as there are local rows, or as soon as the
   *   query has finished loading from the server (which may mean no rows).
   * - `complete`: resolve only once the server has confirmed the full result.
   *
   * @default 'partial'
   */
  suspendUntil?: 'partial' | 'complete'
}

/**
 * A `useQuery` whose promise resolves once the query has results, for use with
 * `<Suspense>` or an `async setup()`.
 *
 * @example
 * ```ts
 * const { data: users } = await useSuspenseQuery(() => queries.users.all())
 * ```
 */
export function useSuspenseQuery<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
>(
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
  options?: MaybeRefOrGetter<UseSuspenseQueryOptions>,
): Promise<QueryResult<TReturn>>

export function useSuspenseQuery<
  TTable extends keyof TSchema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends Schema = DefaultSchema,
  TReturn = PullRow<TTable, TSchema>,
  TContext = DefaultContext,
  MD extends CustomMutatorDefs | undefined = undefined,
>(
  zero: ZeroSource<TSchema, MD, TContext>,
  query: MaybeRefOrGetter<QueryOrQueryRequest<TTable, TInput, TOutput, TSchema, TReturn, TContext>>,
  options?: MaybeRefOrGetter<UseSuspenseQueryOptions>,
): Promise<QueryResult<TReturn>>

export function useSuspenseQuery<TReturn>(...args: unknown[]): Promise<QueryResult<TReturn>> {
  const result = (useQuery as any)(...args) as QueryResult<TReturn>
  const rest = isZeroSourceArg(args[0]) ? args.slice(1) : args
  const options = toValue(rest[1] as MaybeRefOrGetter<UseSuspenseQueryOptions> | undefined)

  return whenSettled(result, options?.suspendUntil ?? 'partial').then(() => result)
}

function whenSettled<TReturn>(result: QueryResult<TReturn>, until: 'partial' | 'complete'): Promise<void> {
  const settled = () => {
    const status = result.status.value
    if (status === 'complete' || status === 'error') {
      return true
    }
    return until === 'partial' && hasRows(result.data.value)
  }

  if (settled()) {
    return Promise.resolve()
  }

  const { promise, resolve } = Promise.withResolvers<void>()
  const stop = watch(settled, (done) => {
    if (done) {
      stop()
      resolve()
    }
  })
  return promise
}

function hasRows(data: unknown): boolean {
  return Array.isArray(data) ? data.length > 0 : data !== undefined
}
