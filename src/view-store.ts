import type { TTL } from '@rocicorp/zero'
import type { ShallowRef } from 'vue'
import type { AnyZero } from './types'
import type { VueView } from './view'
import { shallowRef } from 'vue'
import { maxTTL, ttlToMs } from './ttl'
import { vueViewFactory } from './view'

interface StoreEntry {
  readonly view: ShallowRef<VueView>
  readonly ttls: Map<symbol, TTL>
  ttl: TTL
  materialize: () => VueView
}

/**
 * Materialized views, shared per Zero instance and keyed by query identity, so
 * that N components observing the same query cost one view rather than N.
 */
const stores = new WeakMap<AnyZero, Map<string, StoreEntry>>()

export interface SharedView {
  /** The current view. Replaced (not mutated) by {@linkcode SharedView.retry}. */
  readonly view: ShallowRef<VueView>
  /** Update this holder's requested TTL; the view uses the longest requested. */
  setTTL: (ttl: TTL) => void
  /** Destroy and re-materialize the shared view, for every holder. */
  retry: () => void
  /** Drop this holder. The view is destroyed once the last holder releases. */
  release: () => void
}

export function acquireView(zero: AnyZero, query: unknown, key: string, ttl: TTL): SharedView {
  let entries = stores.get(zero)
  if (!entries) {
    entries = new Map()
    stores.set(zero, entries)
  }

  const token = Symbol('zero-vue:view')
  let entry = entries.get(key)

  if (!entry) {
    const ttls = new Map<symbol, TTL>([[token, ttl]])
    const view = shallowRef<VueView>() as ShallowRef<VueView>
    const created: StoreEntry = {
      view,
      ttls,
      ttl,
      materialize: () => zero.materialize(query as never, vueViewFactory, { ttl: created.ttl }),
    }
    view.value = created.materialize()
    entries.set(key, created)
    entry = created
  }
  else {
    entry.ttls.set(token, ttl)
    applyTTL(entry)
  }

  const held = entry
  let released = false

  return {
    view: held.view,
    setTTL(ttl) {
      if (released) {
        return
      }
      held.ttls.set(token, ttl)
      applyTTL(held)
    },
    retry() {
      if (released) {
        return
      }
      held.view.value.destroy()
      held.view.value = held.materialize()
    },
    release() {
      if (released) {
        return
      }
      released = true
      held.ttls.delete(token)
      if (held.ttls.size > 0) {
        applyTTL(held)
        return
      }
      if (entries.get(key) === held) {
        entries.delete(key)
      }
      held.view.value.destroy()
    },
  }
}

function applyTTL(entry: StoreEntry): void {
  const ttl = maxTTL(entry.ttls.values())
  if (ttl === undefined || ttlToMs(ttl) === ttlToMs(entry.ttl)) {
    return
  }
  entry.ttl = ttl
  entry.view.value.updateTTL(ttl)
}

/** @internal */
export function activeViewCountForTesting(zero: AnyZero): number {
  return stores.get(zero)?.size ?? 0
}
