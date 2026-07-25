import { beforeEach, describe, expect, it } from 'vitest'
import { defaultProviderValues } from './requestTemplates'
import {
  exportBackup,
  importBackup,
  listChannels,
  listRecentProbes,
  monitorDb,
  loadSettings,
  saveChannel,
  saveProbe,
  saveSettings,
} from './storage'

const defaults = defaultProviderValues('openai')

beforeEach(async () => {
  await monitorDb.transaction('rw', monitorDb.channels, monitorDb.probes, monitorDb.settings, async () => {
    await Promise.all([monitorDb.channels.clear(), monitorDb.probes.clear(), monitorDb.settings.clear()])
  })
})

describe('IndexedDB storage', () => {
  it('persists channels and produces a complete backup', async () => {
    const saved = await saveChannel(0, {
      name: 'primary',
      provider: 'openai',
      baseUrl: defaults.baseUrl,
      apiKey: 'sk-plain-text',
      model: defaults.model,
      enabled: true,
      note: '',
      rateMultiplier: 1,
      proxyUrl: '',
      requestTemplate: defaults.requestTemplate,
    })
    await saveProbe({
      channelId: saved.id,
      success: true,
      statusCode: 200,
      latencyMs: 120,
      error: '',
      warning: '',
      requestBody: '{}',
      responseExcerpt: '{}',
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      cachedTokens: 0,
      reasoningTokens: 0,
      billingCurrency: '',
      checkedAt: new Date().toISOString(),
    })

    const backup = await exportBackup()
    expect(backup.channels[0].apiKey).toBe('sk-plain-text')
    expect(backup.probes).toHaveLength(1)
  })

  it('restores a replacement backup', async () => {
    const created = await saveChannel(0, {
      name: 'source',
      provider: 'openai',
      baseUrl: defaults.baseUrl,
      apiKey: 'sk-test',
      model: defaults.model,
      enabled: true,
      note: '',
      rateMultiplier: 1,
      proxyUrl: '',
      requestTemplate: defaults.requestTemplate,
    })
    const backup = await exportBackup()
    backup.channels[0].name = 'restored'

    const result = await importBackup(backup, 'replace')
    expect(result.channels).toBe(1)
    expect((await listChannels())[0].id).toBe(created.id)
    expect((await listChannels())[0].name).toBe('restored')
    expect(await listRecentProbes()).toEqual([])
  })

  it('persists the unified proxy setting in backups', async () => {
    await saveSettings({
      autoProbeEnabled: false,
      autoProbeIntervalMs: 60_000,
      lastAutoProbeAt: '2026-07-25T08:00:00.000Z',
      globalProxyUrl: 'https://proxy.example/?url={{url}}',
    })

    expect((await loadSettings()).globalProxyUrl).toContain('{{url}}')
    expect((await loadSettings()).lastAutoProbeAt).toBe('2026-07-25T08:00:00.000Z')
    expect((await exportBackup()).settings.globalProxyUrl).toContain('{{url}}')
  })
})
