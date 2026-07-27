import Dexie, { type EntityTable } from 'dexie'
import type {
  ImportMode,
  ImportResult,
  MonitorBackup,
  MonitorSettings,
  Probe,
  StoredChannel,
  ChannelInput,
} from '../types'
import { normalizeProxyUrl, validateRequestTemplate } from './probe'

interface SettingRecord {
  key: string
  value: unknown
}

class MonitorDatabase extends Dexie {
  channels!: EntityTable<StoredChannel, 'id'>
  probes!: EntityTable<Probe, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>

  constructor(name = 'llm-channel-monitor') {
    super(name)
    this.version(1).stores({
      channels: '++id, enabled, updatedAt',
      probes: '++id, channelId, checkedAt, [channelId+checkedAt]',
      settings: 'key',
    })
  }
}

export const monitorDb = new MonitorDatabase()

const defaultSettings: MonitorSettings = {
  autoProbeEnabled: false,
  autoProbeIntervalMs: 60_000,
  globalProxyUrl: '',
}

function withoutId<T extends { id: number }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value
  return rest
}

function normalizeChannelInput(input: ChannelInput): ChannelInput {
  const normalized = {
    ...input,
    name: input.name.trim(),
    baseUrl: input.baseUrl.trim().replace(/\/$/, ''),
    apiKey: input.apiKey.trim(),
    model: input.model.trim(),
    note: input.note.trim(),
    proxyUrl: normalizeProxyUrl(input.proxyUrl),
    rateMultiplier: Number.isFinite(input.rateMultiplier) && input.rateMultiplier > 0 ? input.rateMultiplier : 1,
    requestTemplate: { ...input.requestTemplate, path: input.requestTemplate.path.trim() },
  }
  if (!normalized.name || !normalized.baseUrl || !normalized.model) {
    throw new Error('请填写信道名称、Base URL 和模型')
  }
  if (!/^https?:\/\//i.test(normalized.baseUrl)) throw new Error('Base URL 必须以 http:// 或 https:// 开头')
  validateRequestTemplate(normalized.requestTemplate)
  return normalized
}

export async function listChannels() {
  return monitorDb.channels.orderBy('updatedAt').reverse().toArray()
}

export async function getChannel(id: number) {
  return monitorDb.channels.get(id)
}

export async function saveChannel(id: number, input: ChannelInput) {
  const normalized = normalizeChannelInput(input)
  const now = new Date().toISOString()
  if (id) {
    const current = await monitorDb.channels.get(id)
    if (!current) throw new Error('信道不存在')
    const saved: StoredChannel = { ...current, ...normalized, id, updatedAt: now }
    await monitorDb.channels.put(saved)
    return saved
  }
  const value = { ...normalized, createdAt: now, updatedAt: now }
  const nextId = await monitorDb.channels.add(value as StoredChannel)
  return { ...value, id: nextId } as StoredChannel
}

export async function upsertSub2ApiChannels(origin: string, inputs: ChannelInput[]) {
  const normalized = inputs.map(normalizeChannelInput)
  if (!origin || normalized.some((channel) => channel.source?.type !== 'sub2api' || channel.source.origin !== origin)) {
    throw new Error('sub2api 信道来源无效')
  }

  return monitorDb.transaction('rw', monitorDb.channels, async () => {
    const existing = await monitorDb.channels.toArray()
    const managed = existing.filter((channel) => channel.source?.type === 'sub2api' && channel.source.origin === origin)
    const byGroup = new Map(managed.map((channel) => [channel.source!.groupId, channel]))
    const activeGroups = new Set<number>()
    const saved: StoredChannel[] = []
    let created = 0
    let updated = 0
    let disabled = 0

    for (const channel of normalized) {
      const groupId = channel.source!.groupId
      activeGroups.add(groupId)
      const current = byGroup.get(groupId)
      const now = new Date().toISOString()
      if (current) {
        const next: StoredChannel = {
          ...current,
          ...channel,
          id: current.id,
          enabled: current.enabled,
          createdAt: current.createdAt,
          updatedAt: now,
        }
        await monitorDb.channels.put(next)
        saved.push(next)
        updated += 1
      } else {
        const value = { ...channel, createdAt: now, updatedAt: now }
        const id = await monitorDb.channels.add(value as StoredChannel)
        saved.push({ ...value, id } as StoredChannel)
        created += 1
      }
    }

    for (const stale of managed) {
      if (activeGroups.has(stale.source!.groupId) || !stale.enabled) continue
      await monitorDb.channels.update(stale.id, { enabled: false, updatedAt: new Date().toISOString() })
      disabled += 1
    }
    return { channels: saved, created, updated, disabled }
  })
}

export async function deleteChannel(id: number) {
  await monitorDb.transaction('rw', monitorDb.channels, monitorDb.probes, async () => {
    await monitorDb.probes.where('channelId').equals(id).delete()
    await monitorDb.channels.delete(id)
  })
}

export async function saveProbe(probe: Omit<Probe, 'id'>) {
  const id = await monitorDb.probes.add(probe as Probe)
  return { ...probe, id } as Probe
}

export async function listRecentProbes(limit = 80) {
  return monitorDb.probes.orderBy('checkedAt').reverse().limit(limit).toArray()
}

export async function listProbesSince(since: Date) {
  return monitorDb.probes.where('checkedAt').aboveOrEqual(since.toISOString()).toArray()
}

export async function loadSettings(): Promise<MonitorSettings> {
  const record = await monitorDb.settings.get('monitor')
  return { ...defaultSettings, ...(record?.value as Partial<MonitorSettings> | undefined) }
}

export async function saveSettings(settings: MonitorSettings) {
  await monitorDb.settings.put({ key: 'monitor', value: settings })
}

export async function exportBackup(): Promise<MonitorBackup> {
  const [channels, probes, settings] = await Promise.all([
    monitorDb.channels.orderBy('id').toArray(),
    monitorDb.probes.orderBy('checkedAt').toArray(),
    loadSettings(),
  ])
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    channels,
    probes,
    settings,
  }
}

function assertBackup(value: unknown): asserts value is MonitorBackup {
  if (!value || typeof value !== 'object') throw new Error('备份文件不是 JSON 对象')
  const backup = value as Partial<MonitorBackup>
  if (backup.schemaVersion !== 1) throw new Error('不支持该备份版本')
  if (!Array.isArray(backup.channels) || !Array.isArray(backup.probes)) throw new Error('备份缺少信道或探测记录')
  for (const channel of backup.channels) {
    if (!Number.isInteger(channel.id) || !channel.requestTemplate) throw new Error('备份中的信道数据无效')
    normalizeChannelInput(channel)
  }
  for (const probe of backup.probes) {
    if (!Number.isInteger(probe.id) || !Number.isInteger(probe.channelId) || !probe.checkedAt) {
      throw new Error('备份中的探测记录无效')
    }
  }
}

function channelIdentity(channel: StoredChannel) {
  return `${channel.name.trim().toLocaleLowerCase()}\n${channel.baseUrl.trim().toLocaleLowerCase()}\n${channel.model.trim().toLocaleLowerCase()}`
}

export async function importBackup(raw: unknown, mode: ImportMode): Promise<ImportResult> {
  assertBackup(raw)
  return monitorDb.transaction('rw', monitorDb.channels, monitorDb.probes, monitorDb.settings, async () => {
    if (mode === 'replace') {
      await Promise.all([monitorDb.channels.clear(), monitorDb.probes.clear(), monitorDb.settings.clear()])
      await monitorDb.channels.bulkAdd(raw.channels)
      await monitorDb.probes.bulkAdd(raw.probes)
      await saveSettings({ ...defaultSettings, ...raw.settings })
      return { channels: raw.channels.length, probes: raw.probes.length }
    }

    const existing = await monitorDb.channels.toArray()
    const byIdentity = new Map(existing.map((channel) => [channelIdentity(channel), channel]))
    const idMap = new Map<number, number>()
    let channelCount = 0
    for (const imported of raw.channels) {
      const matched = byIdentity.get(channelIdentity(imported))
      if (matched) {
        await monitorDb.channels.put({ ...imported, id: matched.id })
        idMap.set(imported.id, matched.id)
      } else {
        const nextId = await monitorDb.channels.add(withoutId(imported) as StoredChannel)
        idMap.set(imported.id, nextId)
      }
      channelCount += 1
    }
    const importedProbes = raw.probes
      .filter((probe) => idMap.has(probe.channelId))
      .map((probe) => ({ ...withoutId(probe), channelId: idMap.get(probe.channelId)! }))
    if (importedProbes.length) await monitorDb.probes.bulkAdd(importedProbes as Probe[])
    return { channels: channelCount, probes: importedProbes.length }
  })
}
