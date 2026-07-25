import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import type { ChannelInput, ImportMode, MonitorBackup, Probe, SeriesPoint, SortField, StoredChannel, Summary } from '../types'
import { useUserscript } from './useUserscript'
import { buildChannelViews, buildSeriesByChannel, buildSummary, sortChannels } from '../services/metrics'
import { performProbe } from '../services/probe'
import { normalizeProxyUrl } from '../services/probe'
import {
  deleteChannel as deleteStoredChannel,
  exportBackup as createBackup,
  getChannel,
  importBackup as restoreBackup,
  listChannels,
  listProbesSince,
  listRecentProbes,
  loadSettings,
  saveChannel as saveStoredChannel,
  saveProbe,
  saveSettings,
} from '../services/storage'

const emptySummary: Summary = {
  totalChannels: 0,
  enabledChannels: 0,
  healthyChannels: 0,
  recentAvailability: 0,
  averageLatencyMs: 0,
}

function uniqueProbes(...groups: Probe[][]) {
  return [...new Map(groups.flat().map((probe) => [probe.id, probe])).values()]
}

export function useDashboard() {
  const userscript = useUserscript()
  const storedChannels = shallowRef<StoredChannel[]>([])
  const channelViews = shallowRef(buildChannelViews([], []))
  const summary = shallowRef<Summary>({ ...emptySummary })
  const recentProbes = shallowRef<Probe[]>([])
  const channelSeries = shallowRef<Record<number, SeriesPoint[]>>({})
  const selectedChannelId = shallowRef(0)
  const sortBy = shallowRef<SortField>('comprehensive')
  const sortOrder = shallowRef<'asc' | 'desc'>('desc')
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const batchProbing = shallowRef(false)
  const autoProbeEnabled = shallowRef(false)
  const autoProbeSaving = shallowRef(false)
  const autoProbeIntervalMs = shallowRef(60_000)
  const lastAutoProbeAt = shallowRef('')
  const globalProxyUrl = shallowRef('')
  const errorMessage = shallowRef('')

  const channels = computed(() => sortChannels(channelViews.value, sortBy.value, sortOrder.value))
  const selectedChannel = computed(() => channels.value.find((channel) => channel.id === selectedChannelId.value))

  async function loadBase() {
    loading.value = true
    errorMessage.value = ''
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1_000)
      const [nextChannels, probes24h, latestProbes, settings] = await Promise.all([
        listChannels(),
        listProbesSince(since),
        listRecentProbes(80),
        loadSettings(),
      ])
      const allRelevantProbes = uniqueProbes(probes24h, latestProbes)
      storedChannels.value = nextChannels
      channelViews.value = buildChannelViews(nextChannels, allRelevantProbes)
      summary.value = buildSummary(channelViews.value, probes24h)
      recentProbes.value = latestProbes
      channelSeries.value = buildSeriesByChannel(nextChannels, probes24h)
      autoProbeEnabled.value = settings.autoProbeEnabled
      autoProbeIntervalMs.value = settings.autoProbeIntervalMs
      lastAutoProbeAt.value = settings.lastAutoProbeAt ?? ''
      globalProxyUrl.value = settings.globalProxyUrl
      if (selectedChannelId.value && !nextChannels.some((item) => item.id === selectedChannelId.value)) {
        selectedChannelId.value = 0
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载本地数据失败'
    } finally {
      loading.value = false
    }
  }

  async function saveChannel(id: number, payload: ChannelInput) {
    saving.value = true
    try {
      const saved = await saveStoredChannel(id, payload)
      selectedChannelId.value = saved.id
      await loadBase()
      return saved
    } finally {
      saving.value = false
    }
  }

  async function deleteChannel(id: number) {
    await deleteStoredChannel(id)
    if (selectedChannelId.value === id) selectedChannelId.value = 0
    await loadBase()
  }

  async function runProbe(id: number) {
    const channel = await getChannel(id)
    if (!channel) throw new Error('信道不存在')
    const outcome = await performProbe({
      ...channel,
      proxyUrl: channel.proxyUrl || globalProxyUrl.value,
    })
    return saveProbe(outcome)
  }

  async function probeChannel(id: number) {
    const probe = await runProbe(id)
    await loadBase()
    return probe
  }

  async function probeAll() {
    if (batchProbing.value) return
    const enabled = storedChannels.value.filter((channel) => channel.enabled)
    if (!enabled.length) return
    batchProbing.value = true
    try {
      await Promise.allSettled(enabled.map((channel) => runProbe(channel.id)))
      await loadBase()
    } finally {
      batchProbing.value = false
    }
  }

  let autoProbeScheduler: Worker | undefined

  function configureAutoProbeScheduler() {
    if (!autoProbeScheduler) return
    autoProbeScheduler.postMessage({
      enabled: autoProbeEnabled.value,
      intervalMs: autoProbeIntervalMs.value,
      lastRunAt: lastAutoProbeAt.value ? new Date(lastAutoProbeAt.value).getTime() : 0,
    })
  }

  async function runScheduledProbe() {
    if (!autoProbeEnabled.value || batchProbing.value) return
    lastAutoProbeAt.value = new Date().toISOString()
    await saveSettings({
      autoProbeEnabled: autoProbeEnabled.value,
      autoProbeIntervalMs: autoProbeIntervalMs.value,
      lastAutoProbeAt: lastAutoProbeAt.value,
      globalProxyUrl: globalProxyUrl.value,
    })
    configureAutoProbeScheduler()
    await probeAll()
  }

  async function setAutoProbe(enabled: boolean) {
    autoProbeSaving.value = true
    try {
      autoProbeEnabled.value = enabled
      await saveSettings({
        autoProbeEnabled: enabled,
        autoProbeIntervalMs: autoProbeIntervalMs.value,
        lastAutoProbeAt: lastAutoProbeAt.value,
        globalProxyUrl: globalProxyUrl.value,
      })
      configureAutoProbeScheduler()
      if (enabled) void runScheduledProbe()
    } finally {
      autoProbeSaving.value = false
    }
  }

  async function setGlobalProxyUrl(value: string) {
    const normalized = normalizeProxyUrl(value)
    await saveSettings({
      autoProbeEnabled: autoProbeEnabled.value,
      autoProbeIntervalMs: autoProbeIntervalMs.value,
      lastAutoProbeAt: lastAutoProbeAt.value,
      globalProxyUrl: normalized,
    })
    globalProxyUrl.value = normalized
  }

  async function exportBackup(): Promise<MonitorBackup> {
    return createBackup()
  }

  async function importBackup(raw: unknown, mode: ImportMode) {
    const result = await restoreBackup(raw, mode)
    await loadBase()
    configureAutoProbeScheduler()
    return result
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && autoProbeEnabled.value) {
      configureAutoProbeScheduler()
    }
  }

  onMounted(async () => {
    await loadBase()
    autoProbeScheduler = new Worker(new URL('../workers/autoProbeScheduler.worker.ts', import.meta.url), { type: 'module' })
    autoProbeScheduler.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'due') void runScheduledProbe()
    })
    configureAutoProbeScheduler()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })
  onUnmounted(() => {
    autoProbeScheduler?.terminate()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    channels,
    summary,
    recentProbes,
    channelSeries,
    selectedChannelId,
    selectedChannel,
    sortBy,
    sortOrder,
    loading,
    saving,
    batchProbing,
    autoProbeEnabled,
    autoProbeSaving,
    autoProbeIntervalMs,
    globalProxyUrl,
    userscriptStatus: userscript.status,
    errorMessage,
    loadBase,
    saveChannel,
    deleteChannel,
    probeChannel,
    probeAll,
    setAutoProbe,
    setGlobalProxyUrl,
    checkUserscript: userscript.recheck,
    exportBackup,
    importBackup,
  }
}
