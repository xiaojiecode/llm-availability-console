import { describe, expect, it } from 'vitest'
import type { Probe, StoredChannel } from '../types'
import { defaultProviderValues } from './requestTemplates'
import { buildChannelViews, buildSeriesByChannel, buildSummary, sortChannels } from './metrics'

const now = new Date('2026-07-24T00:30:00.000Z').getTime()
const defaults = defaultProviderValues('openai')
const channel: StoredChannel = {
  id: 1,
  name: 'primary',
  provider: 'openai',
  baseUrl: defaults.baseUrl,
  apiKey: 'sk-test',
  model: defaults.model,
  enabled: true,
  note: '',
  rateMultiplier: 1,
  proxyUrl: '',
  requestTemplate: defaults.requestTemplate,
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
}

function probe(id: number, success: boolean, checkedAt: string, latencyMs: number): Probe {
  return {
    id,
    channelId: 1,
    success,
    statusCode: success ? 200 : 500,
    latencyMs,
    error: success ? '' : 'failed',
    warning: '',
    requestBody: '{}',
    responseExcerpt: '{}',
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    cachedTokens: 0,
    reasoningTokens: 0,
    billingCurrency: '',
    checkedAt,
  }
}

describe('dashboard metrics', () => {
  const probes = [
    probe(1, true, '2026-07-24T00:10:10.000Z', 100),
    probe(2, false, '2026-07-24T00:10:50.000Z', 300),
    probe(3, true, '2026-07-24T00:11:10.000Z', 200),
  ]

  it('builds availability, summary, and minute series', () => {
    const views = buildChannelViews([channel], probes, now)
    const summary = buildSummary(views, probes, now)
    const series = buildSeriesByChannel([channel], probes, now)

    expect(views[0].availability).toBe(66.67)
    expect(views[0].availability1h).toBe(66.67)
    expect(views[0].probeCount1h).toBe(3)
    expect(views[0].lastProbe?.id).toBe(3)
    expect(summary.recentAvailability).toBe(66.67)
    expect(summary.averageLatencyMs).toBe(150)
    expect(series[1]).toHaveLength(2)
    expect(series[1][0].successRate).toBe(50)
  })

  it('sorts channels using the requested metric', () => {
    const views = buildChannelViews([
      channel,
      { ...channel, id: 2, name: 'backup', enabled: false },
    ], probes, now)

    expect(sortChannels(views, 'latency', 'asc').map((item) => item.id)).toEqual([1, 2])
  })
})
