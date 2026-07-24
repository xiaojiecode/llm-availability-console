import type { Channel, Probe, SeriesPoint, SortField, StoredChannel, Summary } from '../types'

const DAY_MS = 24 * 60 * 60 * 1_000

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function latestProbe(probes: Probe[]) {
  return probes.reduce<Probe | undefined>((latest, probe) => (
    !latest || probe.checkedAt > latest.checkedAt ? probe : latest
  ), undefined)
}

export function buildChannelViews(storedChannels: StoredChannel[], probes: Probe[], now = Date.now()): Channel[] {
  const since = now - DAY_MS
  return storedChannels.map((channel) => {
    const channelProbes = probes.filter((probe) => probe.channelId === channel.id)
    const recent = channelProbes.filter((probe) => new Date(probe.checkedAt).getTime() >= since)
    const successCount24h = recent.filter((probe) => probe.success).length
    return {
      ...channel,
      lastProbe: latestProbe(channelProbes),
      availability: recent.length ? round((successCount24h / recent.length) * 100) : 0,
      probeCount24h: recent.length,
      successCount24h,
    }
  })
}

export function buildSummary(channels: Channel[], probes: Probe[], now = Date.now()): Summary {
  const enabled = channels.filter((channel) => channel.enabled)
  const enabledIds = new Set(enabled.map((channel) => channel.id))
  const recent = probes.filter((probe) => (
    enabledIds.has(probe.channelId) && new Date(probe.checkedAt).getTime() >= now - DAY_MS
  ))
  const successful = recent.filter((probe) => probe.success)
  return {
    totalChannels: channels.length,
    enabledChannels: enabled.length,
    healthyChannels: enabled.filter((channel) => channel.lastProbe?.success).length,
    recentAvailability: recent.length ? round((successful.length / recent.length) * 100) : 0,
    averageLatencyMs: successful.length
      ? round(successful.reduce((total, probe) => total + probe.latencyMs, 0) / successful.length)
      : 0,
    lastProbeAt: latestProbe(probes)?.checkedAt,
  }
}

function minuteBucket(iso: string) {
  const date = new Date(iso)
  date.setUTCSeconds(0, 0)
  return date.toISOString()
}

export function buildSeriesByChannel(channels: StoredChannel[], probes: Probe[], now = Date.now()) {
  const since = now - DAY_MS
  return Object.fromEntries(channels.map((channel) => {
    const buckets = new Map<string, Probe[]>()
    for (const probe of probes) {
      if (probe.channelId !== channel.id || new Date(probe.checkedAt).getTime() < since) continue
      const bucket = minuteBucket(probe.checkedAt)
      const values = buckets.get(bucket) ?? []
      values.push(probe)
      buckets.set(bucket, values)
    }
    const series: SeriesPoint[] = [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, values]) => {
        const successful = values.filter((probe) => probe.success)
        const latest = latestProbe(values)
        return {
          bucket,
          successRate: round((successful.length / values.length) * 100),
          avgLatencyMs: successful.length
            ? round(successful.reduce((total, probe) => total + probe.latencyMs, 0) / successful.length)
            : 0,
          observedAvgLatencyMs: round(values.reduce((total, probe) => total + probe.latencyMs, 0) / values.length),
          probeCount: values.length,
          latestProbe: latest,
        }
      })
    return [channel.id, series]
  })) as Record<number, SeriesPoint[]>
}

export function sortChannels(channels: Channel[], sortBy: SortField, order: 'asc' | 'desc') {
  const direction = order === 'asc' ? 1 : -1
  const metric = (channel: Channel) => {
    if (sortBy === 'current') return channel.lastProbe?.success ? 1 : 0
    if (sortBy === 'availability') return channel.availability
    if (sortBy === 'latency') return channel.lastProbe?.latencyMs ?? Number.MAX_SAFE_INTEGER
    const health = channel.lastProbe?.success ? 1_000_000 : 0
    return health + channel.availability * 1_000 - (channel.lastProbe?.latencyMs ?? 999_999)
  }
  return [...channels].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    const difference = metric(left) - metric(right)
    if (difference) return difference * direction
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}
