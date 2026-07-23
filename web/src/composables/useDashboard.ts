import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { api } from '../api'
import type { Channel, ChannelInput, Probe, SeriesPoint, Summary } from '../types'

const emptySummary: Summary = {
  totalChannels: 0,
  enabledChannels: 0,
  healthyChannels: 0,
  recentAvailability: 0,
  averageLatencyMs: 0,
}

export function useDashboard() {
  const channels = shallowRef<Channel[]>([])
  const summary = shallowRef<Summary>({ ...emptySummary })
  const recentProbes = shallowRef<Probe[]>([])
  const series = shallowRef<SeriesPoint[]>([])
  const selectedChannelId = shallowRef(0)
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const errorMessage = shallowRef('')

  const selectedChannel = computed(() =>
    channels.value.find((channel) => channel.id === selectedChannelId.value),
  )

  async function loadBase() {
    loading.value = true
    errorMessage.value = ''
    try {
      const [nextChannels, nextSummary, nextProbes] = await Promise.all([
        api.channels(),
        api.overview(),
        api.recentProbes(),
      ])
      channels.value = nextChannels
      summary.value = nextSummary
      recentProbes.value = nextProbes
      if (selectedChannelId.value && !nextChannels.some((item) => item.id === selectedChannelId.value)) {
        selectedChannelId.value = 0
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function loadSeries() {
    try {
      series.value = await api.series(selectedChannelId.value)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '趋势数据加载失败'
    }
  }

  async function saveChannel(id: number, payload: ChannelInput) {
    saving.value = true
    try {
      const saved = id ? await api.updateChannel(id, payload) : await api.createChannel(payload)
      selectedChannelId.value = saved.id
      await loadBase()
      await loadSeries()
    } finally {
      saving.value = false
    }
  }

  async function deleteChannel(id: number) {
    await api.deleteChannel(id)
    if (selectedChannelId.value === id) selectedChannelId.value = 0
    await loadBase()
    await loadSeries()
  }

  async function probeChannel(id: number) {
    await api.probeChannel(id)
    await loadBase()
    if (selectedChannelId.value === id) await loadSeries()
  }

  async function probeAll() {
    const enabled = channels.value.filter((channel) => channel.enabled)
    await Promise.all(enabled.map((channel) => api.probeChannel(channel.id)))
    await loadBase()
    await loadSeries()
  }

  let timer: number | undefined
  watch(selectedChannelId, loadSeries, { immediate: true })
  onMounted(async () => {
    await loadBase()
    timer = window.setInterval(loadBase, 30_000)
  })
  onUnmounted(() => {
    if (timer) window.clearInterval(timer)
  })

  return {
    channels,
    summary,
    recentProbes,
    series,
    selectedChannelId,
    selectedChannel,
    loading,
    saving,
    errorMessage,
    loadBase,
    saveChannel,
    deleteChannel,
    probeChannel,
    probeAll,
  }
}
