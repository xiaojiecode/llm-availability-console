export type Provider = 'openai' | 'anthropic' | 'custom'

export type SortField = 'comprehensive' | 'current' | 'availability' | 'latency'

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestTemplate {
  method: RequestMethod
  path: string
  headersJson: string
  bodyJson: string
}

export interface Sub2ApiChannelSource {
  type: 'sub2api'
  origin: string
  groupId: number
  groupPlatform: string
  remoteKeyId: number
}

export interface Probe {
  id: number
  channelId: number
  success: boolean
  statusCode: number
  latencyMs: number
  error: string
  warning: string
  requestBody: string
  responseExcerpt: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  reasoningTokens: number
  billedAmount?: number
  billingCurrency: string
  checkedAt: string
}

export interface ChannelInput {
  name: string
  provider: Provider
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  note: string
  rateMultiplier: number
  proxyUrl: string
  requestTemplate: RequestTemplate
  source?: Sub2ApiChannelSource
}

export interface StoredChannel extends ChannelInput {
  id: number
  createdAt: string
  updatedAt: string
}

export interface Channel extends StoredChannel {
  lastProbe?: Probe
  availability: number
  probeCount24h: number
  successCount24h: number
  availability1h: number
  probeCount1h: number
  successCount1h: number
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
  observedAvgLatencyMs: number
  probeCount: number
  latestProbe?: Probe
}

export interface MonitorSettings {
  autoProbeEnabled: boolean
  autoProbeIntervalMs: number
  lastAutoProbeAt?: string
  globalProxyUrl: string
}

export interface MonitorBackup {
  schemaVersion: 1
  exportedAt: string
  channels: StoredChannel[]
  probes: Probe[]
  settings: MonitorSettings
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  channels: number
  probes: number
}
