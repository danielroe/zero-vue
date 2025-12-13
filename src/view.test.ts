import type { Query } from '@rocicorp/zero'

import { resolver } from '@rocicorp/resolver'
import {
  createBuilder,
  createSchema,
  defineMutatorsWithType,
  defineMutatorWithType,
  defineQueriesWithType,
  defineQuery,
  number,
  relationships,
  string,
  table,
  Zero,
} from '@rocicorp/zero'
import { addContextToQuery } from '@rocicorp/zero/bindings'
import { assert, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import z from 'zod'
import { VueView, vueViewFactory } from './view'

const simpleSchema = createSchema({
  tables: [
    table('table')
      .columns({
        a: number(),
        b: string(),
      })
      .primaryKey('a'),
  ],
})

function setupSimple() {
  const defineMutators = defineMutatorsWithType<typeof simpleSchema>()
  const defineMutator = defineMutatorWithType<typeof simpleSchema>()
  const mutators = defineMutators({
    insert: defineMutator(
      z.object({ a: z.number(), b: z.string() }),
      async ({ tx, args: { a, b } }) => {
        return tx.mutate.table.insert({ a, b })
      },
    ),
    update: defineMutator(
      z.object({ a: z.number(), b: z.string() }),
      async ({ tx, args: { a, b } }) => {
        return tx.mutate.table.update({ a, b })
      },
    ),
    delete: defineMutator(
      z.object({ a: z.number() }),
      async ({ tx, args: { a } }) => {
        return tx.mutate.table.delete({ a })
      },
    ),
  })

  const zero = new Zero({
    userID: 'asdf',
    server: null,
    schema: simpleSchema,
    mutators,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  })

  const zql = createBuilder(simpleSchema)
  const defineQueries = defineQueriesWithType<typeof simpleSchema>()
  const queries = defineQueries({
    table: defineQuery(() => zql.table),
  })

  const tableQuery = addContextToQuery(queries.table(), zero.context)

  return { zero, queries, mutators, tableQuery }
}

const recursiveTable = table('tree')
  .columns({
    id: number(),
    name: string(),
    data: string().optional(),
    childID: number().optional(),
  })
  .primaryKey('id')

const treeSchema = createSchema({
  tables: [recursiveTable],
  relationships: [
    relationships(recursiveTable, ({ many }) => ({
      children: many({
        sourceField: ['childID'],
        destSchema: recursiveTable,
        destField: ['id'],
      }),
    })),
  ],
})

function setupTree() {
  const defineMutators = defineMutatorsWithType<typeof treeSchema>()
  const defineMutator = defineMutatorWithType<typeof treeSchema>()
  const mutators = defineMutators({
    insert: defineMutator(
      z.object({ id: z.number(), name: z.string(), data: z.string().optional().nullable(), childID: z.number().nullable() }),
      async ({ tx, args: { id, name, data, childID } }) => {
        return tx.mutate.tree.insert({
          id,
          name,
          data,
          childID,
        })
      },
    ),
    update: defineMutator(
      z.object({ id: z.number(), data: z.string() }),
      async ({ tx, args: { id, data } }) => {
        return tx.mutate.tree.update({
          id,
          data,
        })
      },
    ),
    delete: defineMutator(
      z.object({ id: z.number() }),
      async ({ tx, args: { id } }) => {
        return tx.mutate.tree.delete({ id })
      },
    ),
  })

  const zero = new Zero({
    userID: 'asdf',
    server: null,
    schema: treeSchema,
    mutators,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  })

  const zql = createBuilder(treeSchema)
  const defineQueries = defineQueriesWithType<typeof treeSchema>()
  const queries = defineQueries({
    table: defineQuery(() => zql.tree.related('children')),
    one: defineQuery(() => zql.tree.related('children').one()),
  })

  const treeWithChildrenQuery = addContextToQuery(queries.table(), zero.context)
  const one = addContextToQuery(queries.one(), zero.context)

  return { zero, queries, mutators, treeWithChildrenQuery, one }
}

const issue = table('issue')
  .columns({
    id: number(),
    name: string(),
  })
  .primaryKey('id')

const label = table('label')
  .columns({
    id: number(),
    name: string(),
  })
  .primaryKey('id')

const issueLabel = table('issueLabel')
  .columns({
    id: number(),
    issueID: number(),
    labelID: number(),
    extra: string(),
  })
  .primaryKey('id')

const collapseSchema = createSchema({
  tables: [issue, label, issueLabel],
  relationships: [
    relationships(issue, ({ many }) => ({
      labels: many(
        {
          sourceField: ['id'],
          destSchema: issueLabel,
          destField: ['issueID'],
        },
        {
          sourceField: ['labelID'],
          destSchema: label,
          destField: ['id'],
        },
      ),
    })),
  ],
})

function setupCollapse() {
  const zero = new Zero({
    userID: 'asdf',
    server: null,
    schema: collapseSchema,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  })

  const zql = createBuilder(collapseSchema)
  const defineQueries = defineQueriesWithType<typeof collapseSchema>()
  const queries = defineQueries({
    issuesWithLabelsQuery: defineQuery(() => zql.issue.related('labels')),
  })

  const issuesWithLabelsQuery = addContextToQuery(queries.issuesWithLabelsQuery(), zero.context)

  return { zero, queries, issuesWithLabelsQuery }
}

describe('vueView', () => {
  it('basics', async () => {
    const { zero, mutators, tableQuery } = setupSimple()

    await zero.mutate(mutators.insert({ a: 1, b: 'a' })).client
    await zero.mutate(mutators.insert({ a: 2, b: 'b' })).client

    const view = zero.materialize(
      tableQuery,
      vueViewFactory,
    )

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
    ]
  `)

    // TODO: Test with a real resolver
    // expect(view.status).toEqual("complete");

    await zero.mutate(mutators.insert({ a: 3, b: 'c' })).client

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
      {
        "a": 3,
        "b": "c",
        Symbol(rc): 1,
      },
    ]
  `)

    await zero.mutate(mutators.delete({ a: 1 })).client
    await zero.mutate(mutators.delete({ a: 2 })).client

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 3,
        "b": "c",
        Symbol(rc): 1,
      },
    ]
  `)

    await zero.mutate(mutators.delete({ a: 3 })).client

    expect(view.data).toEqual([])
  })

  it.skip('basics-perf', async () => {
    const iterations = 10_000

    const { zero, mutators, tableQuery } = setupSimple()

    const view = zero.materialize(tableQuery, vueViewFactory)
    assert(view.data)
    assert(typeof view.data === 'object')
    assert('length' in view.data)
    expect(view.data?.length).toBe(0)

    for (const i in [...Array.from({ length: iterations }).keys()]) {
      await zero.mutate(mutators.insert({ a: Number(i), b: 'a' })).client
    }

    expect(view.data?.length).toBe(iterations)
  })

  it('hydrate-empty', async () => {
    const { zero, tableQuery } = setupSimple()

    const view = zero.materialize(tableQuery, vueViewFactory)

    expect(view.data).toEqual([])
  })

  it('tree', async () => {
    const { zero, mutators, treeWithChildrenQuery } = setupTree()

    await zero.mutate(mutators.insert({ id: 1, name: 'foo', data: null, childID: 2 })).client
    await zero.mutate(mutators.insert({
      id: 2,
      name: 'foobar',
      data: null,
      childID: null,
    })).client
    await zero.mutate(mutators.insert({ id: 3, name: 'mon', data: null, childID: 4 })).client
    await zero.mutate(mutators.insert({
      id: 4,
      name: 'monkey',
      data: null,
      childID: null,
    })).client

    const view = zero.materialize(treeWithChildrenQuery, vueViewFactory)

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)

    await zero.mutate(mutators.insert({ id: 5, name: 'chocolate', childID: 2 })).client
    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 5,
        "name": "chocolate",
        Symbol(rc): 1,
      },
    ]
  `)

    await zero.mutate(mutators.delete({ id: 2 })).client
    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
      {
        "childID": 2,
        "children": [],
        "data": null,
        "id": 5,
        "name": "chocolate",
        Symbol(rc): 1,
      },
    ]
  `)

    await zero.mutate(mutators.insert({
      id: 2,
      name: 'foobaz',
      childID: null,
    })).client

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobaz",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 2,
        "name": "foobaz",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobaz",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 5,
        "name": "chocolate",
        Symbol(rc): 1,
      },
    ]
  `)
  })

  it('tree-single', async () => {
    const { zero, mutators, one } = setupTree()

    await zero.mutate(mutators.insert({ id: 1, name: 'foo', childID: 2 })).client
    await zero.mutate(mutators.insert({ id: 2, name: 'foobar', childID: null })).client

    const view = zero.materialize(one, vueViewFactory)

    expect(view.data).toMatchInlineSnapshot(`
    {
      "childID": 2,
      "children": [
        {
          "childID": null,
          "data": null,
          "id": 2,
          "name": "foobar",
          Symbol(rc): 1,
        },
      ],
      "data": null,
      "id": 1,
      "name": "foo",
      Symbol(rc): 1,
    }
  `)

    // remove the child
    await zero.mutate(mutators.delete({ id: 2 })).client

    expect(view.data).toMatchInlineSnapshot(`
    {
      "childID": 2,
      "children": [],
      "data": null,
      "id": 1,
      "name": "foo",
      Symbol(rc): 1,
    }
  `)

    // remove the parent
    await zero.mutate(mutators.delete({ id: 1 })).client
    expect(view.data).toEqual(undefined)
  })

  it('collapse', async () => {
    const { zero, issuesWithLabelsQuery } = setupCollapse()

    const view = zero.materialize(issuesWithLabelsQuery, vueViewFactory)

    expect(view.data).toEqual([])

    const changeSansType = {
      node: {
        row: {
          id: 1,
          name: 'issue',
        },
        relationships: {
          labels: () => [
            {
              row: {
                id: 1,
                issueId: 1,
                labelId: 1,
                extra: 'a',
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 1,
                      name: 'label',
                    },
                    relationships: {},
                  },
                ],
              },
            },
          ],
        },
      },
    } as const

    view.push({
      type: 'add',
      ...changeSansType,
    })

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)

    view.push({
      type: 'remove',
      ...changeSansType,
    })
    expect(view.data).toEqual([])

    view.push({
      type: 'add',
      ...changeSansType,
    })

    view.push({
      type: 'child',
      node: {
        row: {
          id: 1,
          name: 'issue',
        },
        relationships: {
          labels: () => [
            {
              row: {
                id: 1,
                issueId: 1,
                labelId: 1,
                extra: 'a',
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 1,
                      name: 'label',
                    },
                    relationships: {},
                  },
                ],
              },
            },
            {
              row: {
                id: 2,
                issueId: 1,
                labelId: 2,
                extra: 'b',
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 2,
                      name: 'label2',
                    },
                    relationships: {},
                  },
                ],
              },
            },
          ],
        },
      },
      child: {
        relationshipName: 'labels',
        change: {
          type: 'add',
          node: {
            row: {
              id: 2,
              issueId: 1,
              labelId: 2,
              extra: 'b',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 2,
                    name: 'label2',
                  },
                  relationships: {},
                },
              ],
            },
          },
        },
      },
    })

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
          {
            "id": 2,
            "name": "label2",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)

    // edit the hidden row
    view.push({
      type: 'child',
      node: {
        row: {
          id: 1,
          name: 'issue',
        },
        relationships: {
          labels: () => [
            {
              row: {
                id: 1,
                issueId: 1,
                labelId: 1,
                extra: 'a',
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 1,
                      name: 'label',
                    },
                    relationships: {},
                  },
                ],
              },
            },
            {
              row: {
                id: 2,
                issueId: 1,
                labelId: 2,
                extra: 'b2',
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 2,
                      name: 'label2',
                    },
                    relationships: {},
                  },
                ],
              },
            },
          ],
        },
      },
      child: {
        relationshipName: 'labels',
        change: {
          type: 'edit',
          oldNode: {
            row: {
              id: 2,
              issueId: 1,
              labelId: 2,
              extra: 'b',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 2,
                    name: 'label2',
                  },
                  relationships: {},
                },
              ],
            },
          },
          node: {
            row: {
              id: 2,
              issueId: 1,
              labelId: 2,
              extra: 'b2',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 2,
                    name: 'label2',
                  },
                  relationships: {},
                },
              ],
            },
          },
        },
      },
    })

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
          {
            "id": 2,
            "name": "label2",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)

    // edit the leaf
    view.push({
      type: 'child',
      node: {
        row: {
          id: 1,
          name: 'issue',
        },
        relationships: {
          labels: () => [
            {
              row: {
                id: 1,
                issueId: 1,
                labelId: 1,
                extra: 'a',
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 1,
                      name: 'label',
                    },
                    relationships: {},
                  },
                ],
              },
            },
            {
              row: {
                id: 2,
                issueId: 1,
                labelId: 2,
                extra: 'b2',
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 2,
                      name: 'label2x',
                    },
                    relationships: {},
                  },
                ],
              },
            },
          ],
        },
      },
      child: {
        relationshipName: 'labels',
        change: {
          type: 'child',
          node: {
            row: {
              id: 2,
              issueId: 1,
              labelId: 2,
              extra: 'b2',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 2,
                    name: 'label2x',
                  },
                  relationships: {},
                },
              ],
            },
          },
          child: {
            relationshipName: 'labels',
            change: {
              type: 'edit',
              oldNode: {
                row: {
                  id: 2,
                  name: 'label2',
                },
                relationships: {},
              },
              node: {
                row: {
                  id: 2,
                  name: 'label2x',
                },
                relationships: {},
              },
            },
          },
        },
      },
    })

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
          {
            "id": 2,
            "name": "label2x",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)
  })

  it('collapse-single', async () => {
    const { zero, issuesWithLabelsQuery } = setupCollapse()
    const view = zero.materialize(issuesWithLabelsQuery, vueViewFactory)

    expect(view.data).toEqual([])

    const changeSansType = {
      node: {
        row: {
          id: 1,
          name: 'issue',
        },
        relationships: {
          labels: () => [
            {
              row: {
                id: 1,
                issueId: 1,
                labelId: 1,
              },
              relationships: {
                labels: () => [
                  {
                    row: {
                      id: 1,
                      name: 'label',
                    },
                    relationships: {},
                  },
                ],
              },
            },
          ],
        },
      },
    } as const
    view.push({
      type: 'add',
      ...changeSansType,
    })

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)
  })

  it('basic with edit pushes', async () => {
    const { zero, tableQuery, mutators } = setupSimple()
    await zero.mutate(mutators.insert({ a: 1, b: 'a' })).client
    await zero.mutate(mutators.insert({ a: 2, b: 'b' })).client

    const view = zero.materialize(tableQuery, vueViewFactory)
    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
    ]
  `)

    await zero.mutate(mutators.update({ a: 2, b: 'b2' })).client

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b2",
        Symbol(rc): 1,
      },
    ]
  `)

    await zero.mutate(mutators.insert({ a: 3, b: 'b3' })).client
    await zero.mutate(mutators.delete({ a: 2 })).client

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 3,
        "b": "b3",
        Symbol(rc): 1,
      },
    ]
  `)
  })

  it('tree edit', async () => {
    const { zero, mutators, treeWithChildrenQuery } = setupTree()

    await zero.mutate(mutators.insert({ id: 1, name: 'foo', data: 'a', childID: 2 })).client
    await zero.mutate(mutators.insert({
      id: 2,
      name: 'foobar',
      data: 'b',
      childID: null,
    })).client
    await zero.mutate(mutators.insert({ id: 3, name: 'mon', data: 'c', childID: 4 })).client
    await zero.mutate(mutators.insert({
      id: 4,
      name: 'monkey',
      data: 'd',
      childID: null,
    })).client

    const view = zero.materialize(treeWithChildrenQuery, vueViewFactory)

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": "b",
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": "a",
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "b",
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": "d",
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": "c",
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "d",
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)

    // Edit root
    await zero.mutate(mutators.update({ id: 1, data: 'a2' })).client

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": "b",
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": "a2",
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "b",
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": "d",
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": "c",
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "d",
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)

    // Edit leaf
    await zero.mutate(mutators.update({ id: 4, data: 'd2' })).client
    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": "b",
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": "a2",
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "b",
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": "d2",
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": "c",
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "d2",
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)
  })

  it('queryComplete promise', async () => {
    const { zero, mutators, tableQuery } = setupSimple()
    await zero.mutate(mutators.insert({ a: 1, b: 'a' })).client
    await zero.mutate(mutators.insert({ a: 2, b: 'b' })).client

    const queryCompleteResolver = resolver<true>()

    const onTransactionCommit = () => {}

    const view = zero.materialize(tableQuery, (_, input) => {
      return new VueView(
        input,
        onTransactionCommit,
        { singular: false, relationships: {} },
        () => {},
        queryCompleteResolver.promise,
        () => {},
      )
    })

    expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
    ]
  `)
    expect(view.status).toEqual('unknown')

    queryCompleteResolver.resolve(true)
    await nextTick()
    expect(view.status).toEqual('complete')
  })
})

describe('vueViewFactory', () => {
  interface TestReturn {
    a: number
    b: string
  }

  it('correctly calls corresponding handlers', async () => {
    const { zero, mutators, tableQuery } = setupSimple()
    await zero.mutate(mutators.insert({ a: 1, b: 'a' })).client
    await zero.mutate(mutators.insert({ a: 2, b: 'b' })).client

    const onDestroy = vi.fn()
    const onTransactionCommit = vi.fn()

    const view = zero.materialize(tableQuery, (_, input) => {
      return vueViewFactory(
        undefined as unknown as Query<'table', typeof simpleSchema, TestReturn>,
        input,
        { singular: false, relationships: {} },
        onDestroy,
        onTransactionCommit,
        true,
        () => {},
      )
    })

    expect(view).toBeDefined()
    expect(onTransactionCommit).not.toHaveBeenCalled()
    expect(onDestroy).not.toHaveBeenCalled()
    view.destroy()
    expect(onDestroy).toHaveBeenCalledTimes(1)
  })
})
