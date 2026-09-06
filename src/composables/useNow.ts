// One shared clock for labels like "5m ago": it ticks only while a component
// that reads it is mounted, so idle pages keep no timer running.
import { onMounted, onUnmounted, ref, type Ref } from 'vue'

const now = ref(Date.now())
let readers = 0
let timer: ReturnType<typeof setInterval> | null = null

function start(intervalMs: number) {
  readers += 1
  if (timer !== null) return
  timer = setInterval(() => {
    now.value = Date.now()
  }, intervalMs)
}

function stop() {
  readers = Math.max(0, readers - 1)
  if (readers > 0 || timer === null) return
  clearInterval(timer)
  timer = null
}

/** The current time, refreshed every `intervalMs` while a reader is mounted. */
export function useNow(intervalMs = 30_000): Ref<number> {
  onMounted(() => start(intervalMs))
  onUnmounted(stop)
  return now
}
