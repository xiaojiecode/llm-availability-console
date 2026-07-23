import type { Channel, ChannelInput, Probe, SeriesPoint, Summary } from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || '请求失败（' + response.status + '）')
  }
  return payload as T
}

export const api = {
  channels: () => request<Channel[]>('/api/channels'),
  overview: () => request<Summary>('/api/overview'),
  recentProbes: () => request<Probe[]>('/api/probes/recent?limit=80'),
  series: (channelId: number, window = '24h') =>
    request<SeriesPoint[]>('/api/metrics/series?channelId=' + channelId + '&window=' + window),
  createChannel: (payload: ChannelInput) =>
    request<Channel>('/api/channels', { method: 'POST', body: JSON.stringify(payload) }),
  updateChannel: (id: number, payload: ChannelInput) =>
    request<Channel>('/api/channels/' + id, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteChannel: (id: number) =>
    request<void>('/api/channels/' + id, { method: 'DELETE' }),
  probeChannel: (id: number) =>
    request<Probe>('/api/channels/' + id + '/probe', { method: 'POST' }),
}
