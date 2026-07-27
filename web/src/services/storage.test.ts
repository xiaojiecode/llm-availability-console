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
  upsertSub2ApiChannels,
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

  it('updates managed sub2api groups in place and disables groups no longer available', async () => {
    const source = (groupId: number) => ({
      type: 'sub2api' as const,
      origin: 'https://relay.example',
      groupId,
      groupPlatform: 'openai',
      remoteKeyId: groupId * 10,
    })
    const channel = (groupId: number, name: string) => ({
      name,
      provider: 'openai' as const,
      baseUrl: 'https://relay.example',
      apiKey: `sk-${groupId}-value`,
      model: 'models',
      enabled: true,
      note: '',
      rateMultiplier: 1,
      proxyUrl: '',
      requestTemplate: { ...defaults.requestTemplate, method: 'GET' as const, path: '/v1/models' },
      source: source(groupId),
    })

    const first = await upsertSub2ApiChannels('https://relay.example', [channel(1, 'one'), channel(2, 'two')])
    const second = await upsertSub2ApiChannels('https://relay.example', [channel(1, 'one updated')])
    const stored = await listChannels()

    expect(first.created).toBe(2)
    expect(second.updated).toBe(1)
    expect(second.disabled).toBe(1)
    expect(stored.find((item) => item.source?.groupId === 1)?.id).toBe(first.channels[0].id)
    expect(stored.find((item) => item.source?.groupId === 1)?.name).toBe('one updated')
    expect(stored.find((item) => item.source?.groupId === 2)?.enabled).toBe(false)
  })

  it('disables all managed channels when the account no longer has available groups', async () => {
    const managed = await saveChannel(0, {
      name: 'managed',
      provider: 'openai',
      baseUrl: 'https://relay.example',
      apiKey: 'sk-managed-value',
      model: 'models',
      enabled: true,
      note: '',
      rateMultiplier: 1,
      proxyUrl: '',
      requestTemplate: { ...defaults.requestTemplate, method: 'GET', path: '/v1/models' },
      source: {
        type: 'sub2api',
        origin: 'https://relay.example',
        groupId: 1,
        groupPlatform: 'openai',
        remoteKeyId: 10,
      },
    })

    const result = await upsertSub2ApiChannels('https://relay.example', [])

    expect(result.disabled).toBe(1)
    expect((await monitorDb.channels.get(managed.id))?.enabled).toBe(false)
  })
})
