import type { MaybeRefOrGetter } from 'vue'
import { onUnmounted, toValue, watch } from 'vue'

export function useInterval(callback: () => void, delay: MaybeRefOrGetter<number | null>) {
  let id: ReturnType<typeof setInterval> | undefined

  function clear() {
    if (id) {
      clearInterval(id)
      id = undefined
    }
  }

  const stop = watch(() => toValue(delay), (delay) => {
    clear()

    if (delay === null) {
      return
    }

    id = setInterval(callback, delay)
  }, { immediate: true })

  onUnmounted(() => {
    stop()
    clear()
  })
}
