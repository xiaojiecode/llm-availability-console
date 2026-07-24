import type { Channel } from '../types'

export interface ChannelGroup {
  key: string
  label: string
  channels: Channel[]
}

const genericHostPrefixes = new Set(['api', 'www', 'gateway', 'proxy', 'chat'])

export function channelGroupLabel(channel: Channel) {
  try {
    const labels = new URL(channel.baseUrl).hostname.split('.').filter(Boolean)
    const firstSpecificLabel = labels.find((label) => !genericHostPrefixes.has(label.toLocaleLowerCase()))
    if (firstSpecificLabel) return firstSpecificLabel.toLocaleLowerCase()
  } catch {
    // Fall through to the channel name for non-standard Base URLs.
  }
  return channel.name.trim().split(/[\s/_-]+/)[0]?.toLocaleLowerCase() || '其他'
}

export function groupChannels(channels: Channel[]) {
  const groups = new Map<string, ChannelGroup>()
  for (const channel of channels) {
    const label = channelGroupLabel(channel)
    const key = label.toLocaleLowerCase()
    const group = groups.get(key) ?? { key, label, channels: [] }
    group.channels.push(channel)
    groups.set(key, group)
  }
  return [...groups.values()]
}
