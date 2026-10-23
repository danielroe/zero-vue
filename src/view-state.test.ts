import type { ErroredQuery, Input, Node } from '@rocicorp/zero'
import { describe, expect, it } from 'vitest'
import { VueView } from './view'

const queryError = {
  id: 'q1',
  name: 'TestQuery',
  message: 'Something went wrong',
  error: 'app',
} satisfies ErroredQuery

function node(a: number): Node {
  return { row: { a, b: String(a) }, relationships: {} }
}

function setup(queryComplete: Promise<true>, initialRows: Node[] = []) {
  const input: Input = {
    setOutput: () => {},
    fetch: () => initialRows,
    destroy: () => {},
    getSchema: () => ({
      tableName: 'table',
      columns: { a: { type: 'number' }, b: { type: 'string' } },
      primaryKey: ['a'],
      relationships: {},
      isHidden: false,
      system: 'test',
      compareRows: (a, b) => Number(a.a) - Number(b.a),
    }),
  }
  let commit = () => {}
  const view = new VueView(
    input,
    (cb) => { commit = cb },
    { singular: false, relationships: {} },
    () => {},
    queryComplete,
    () => {},
  )
  return { view, commit: () => commit() }
}

// These four cases mirror zero-solid/src/solid-view.test.ts in Zero 1.11.0.
describe('vueView result state', () => {
  it('cached result type', async () => {
    const completion = Promise.withResolvers<true>()
    const { view } = setup(completion.promise, [node(1)])

    view.markCached()
    expect(view.status).toBe('cached')
    expect(view.data).toMatchObject([{ a: 1, b: '1' }])

    view.unmarkCached()
    expect(view.status).toBe('unknown')
    view.markCached()
    expect(view.status).toBe('cached')

    completion.resolve(true)
    await completion.promise
    expect(view.status).toBe('complete')
    view.markCached()
    view.unmarkCached()
    expect(view.status).toBe('complete')
  })

  it('cached result type waits for uncommitted rows', () => {
    const { view, commit } = setup(Promise.withResolvers<true>().promise)

    view.push([0, node(1), null])
    view.markCached()
    expect(view.status).toBe('unknown')
    expect(view.data).toEqual([])

    commit()
    expect(view.status).toBe('cached')
    expect(view.data).toMatchObject([{ a: 1, b: '1' }])

    view.unmarkCached()
    expect(view.status).toBe('unknown')

    view.push([0, node(2), null])
    view.markCached()
    view.unmarkCached()
    view.markCached()
    expect(view.status).toBe('unknown')
    commit()
    expect(view.status).toBe('cached')
    expect(view.data).toMatchObject([{ a: 1 }, { a: 2 }])
  })

  it('holdData makes a result type transition wait for the commit without rows', () => {
    const { view, commit } = setup(Promise.withResolvers<true>().promise)

    view.holdData()
    view.markCached()
    expect(view.status).toBe('unknown')
    commit()
    expect(view.status).toBe('cached')

    view.unmarkCached()
    expect(view.status).toBe('unknown')
  })

  it('holdData makes an error wait for the commit', async () => {
    const completion = Promise.withResolvers<true>()
    const { view, commit } = setup(completion.promise)

    view.holdData()
    completion.reject(queryError)
    await completion.promise.catch(() => {})
    await Promise.resolve()
    expect(view.status).toBe('unknown')
    commit()
    expect(view.status).toBe('error')
    expect(view.error).toMatchObject({ type: 'app', message: 'Something went wrong' })
  })
})
