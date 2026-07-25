interface SchedulerConfig {
  enabled: boolean
  intervalMs: number
  lastRunAt: number
}

let config: SchedulerConfig = { enabled: false, intervalMs: 60_000, lastRunAt: 0 }
let timer: number | undefined

function clearSchedule() {
  if (timer !== undefined) self.clearTimeout(timer)
  timer = undefined
}

function schedule() {
  clearSchedule()
  if (!config.enabled) return
  const dueAt = config.lastRunAt ? config.lastRunAt + config.intervalMs : Date.now()
  timer = self.setTimeout(() => {
    timer = undefined
    const now = Date.now()
    if (now >= dueAt) {
      config.lastRunAt = now
      self.postMessage({ type: 'due', scheduledAt: now })
    }
    schedule()
  }, Math.max(0, dueAt - Date.now()))
}

self.addEventListener('message', (event: MessageEvent<SchedulerConfig>) => {
  if (!event.data || typeof event.data !== 'object') return
  config = {
    enabled: Boolean(event.data.enabled),
    intervalMs: Math.max(1_000, Number(event.data.intervalMs) || 60_000),
    lastRunAt: Math.max(0, Number(event.data.lastRunAt) || 0),
  }
  schedule()
})
