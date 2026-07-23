export type Provider = 'openai' | 'anthropic'

export interface Probe {
  id: number
  channelId: number
  success: boolean
  statusCode: number
  latencyMs: number
  error: string
  responseExcerpt: string
  checkedAt: string
}

export interface Channel {
  id: number
  name: string
  provider: Provider
  baseUrl: string
  model: string
  enabled: boolean
  apiKeySet: boolean
  note: string
  createdAt: string
  updatedAt: string
  lastProbe?: Probe
  availability: number
  probeCount24h: number
}

export interface ChannelInput {
  name: string
  provider: Provider
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  note: string
}

export interface Summary {
  totalChannels: number
  enabledChannels: number
  healthyChannels: number
  recentAvailability: number
  averageLatencyMs: number
  lastProbeAt?: string
}

export interface SeriesPoint {
  bucket: string
  successRate: number
  avgLatencyMs: number
  probeCount: number
}
