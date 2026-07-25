<script setup lang="ts">
import { computed } from 'vue'
import { Pencil, Play, Trash2 } from '@lucide/vue'
import ChannelLatencyChart from './ChannelLatencyChart.vue'
import type { Channel, SeriesPoint } from '../types'
import { groupChannels } from '../utils/channelGroup'
import { localizeErrorMessage } from '../utils/errorMessage'

const props = defineProps<{
  channels: Channel[]
  mergeChannelGroups: boolean
  seriesByChannel: Record<number, SeriesPoint[]>
  selectedChannelId: number
  loading: boolean
  busyId: number
}>()

const emit = defineEmits<{
  select: [id: number]
  edit: [channel: Channel]
  probe: [channel: Channel]
  delete: [channel: Channel]
  toggle: [channel: Channel, enabled: boolean]
}>()

const channelGroups = computed(() => props.mergeChannelGroups
  ? [{ key: 'all', label: '全部渠道', channels: props.channels }]
  : groupChannels(props.channels))

function providerLabel(provider: Channel['provider']) {
  if (provider === 'anthropic') return 'Claude'
  if (provider === 'custom') return '自定义'
  return 'OpenAI'
}

function status(channel: Channel) {
  if (!channel.enabled) return { label: '已停用', tone: 'muted' }
  if (!channel.lastProbe) return { label: '待探测', tone: 'pending' }
  if (!channel.lastProbe.success) return { label: '异常', tone: 'danger' }
  if (channel.lastProbe.warning) return { label: '警告', tone: 'warning' }
  return { label: '可用', tone: 'success' }
}

function formatTime(value?: string) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatAvailability(channel: Channel) {
  return channel.probeCount24h ? channel.availability.toFixed(2) + '%' : '--'
}

function formatRate(rate: number) {
  return Number(rate.toFixed(2)) + 'x'
}

function formatError(error: string) {
  return localizeErrorMessage(error, '探测失败')
}

function formatWarning(warning: string) {
  return localizeErrorMessage(warning, '探测警告')
}

function selectCard(id: number) {
  emit('select', id)
}
</script>

<template>
  <div v-loading="loading" class="channel-groups" aria-live="polite">
    <el-empty v-if="!channels.length" class="channel-empty" description="暂无信道" />
    <section v-for="group in channelGroups" :key="group.key" class="channel-group">
      <div class="channel-group__header">
        <h3>{{ group.label }}</h3>
        <span>{{ group.channels.length }} 个信道</span>
      </div>
      <div class="channel-grid">
        <article
          v-for="channel in group.channels"
          :key="channel.id"
          :class="[
            'channel-card',
            'channel-card--' + status(channel).tone,
            { 'channel-card--selected': selectedChannelId === channel.id, 'channel-card--disabled': !channel.enabled },
          ]"
          tabindex="0"
          :aria-label="channel.name + ' 信道状态'"
          @click="selectCard(channel.id)"
          @keydown.enter="selectCard(channel.id)"
          @keydown.space.prevent="selectCard(channel.id)"
        >
          <div class="channel-card__header">
            <div class="channel-title">
              <span :class="['status-dot', 'status-dot--' + status(channel).tone]" aria-hidden="true" />
              <div class="channel-title__copy">
                <strong :title="channel.name">{{ channel.name }}</strong>
                <div class="channel-title__meta">
                  <span>{{ providerLabel(channel.provider) }} · {{ channel.model }} ·</span>
                  <el-tag effect="plain" size="small" type="info">{{ formatRate(channel.rateMultiplier) }}</el-tag>
                  <span :title="channel.baseUrl">· {{ channel.baseUrl }}</span>
                </div>
              </div>
            </div>
            <el-tag :type="status(channel).tone === 'success' ? 'success' : status(channel).tone === 'danger' ? 'danger' : status(channel).tone === 'warning' ? 'warning' : status(channel).tone === 'pending' ? 'warning' : 'info'" effect="light" size="small">
              {{ status(channel).label }}
            </el-tag>
          </div>

          <div class="channel-metrics">
            <div class="channel-metric">
              <span>1h 可用率</span>
              <strong :class="{ 'metric-good': channel.probeCount1h && channel.availability1h >= 99 }">
                {{ channel.probeCount1h ? channel.availability1h.toFixed(2) + '%' : '--' }}
              </strong>
              <small v-if="channel.probeCount1h">
                {{ channel.successCount1h }} / {{ channel.probeCount1h }} 次成功
              </small>
            </div>
            <div class="channel-metric">
              <span>24h 可用率</span>
              <strong :class="{ 'metric-good': channel.probeCount24h && channel.availability >= 99 }">
                {{ formatAvailability(channel) }}
              </strong>
              <small v-if="channel.probeCount24h">
                {{ channel.successCount24h }} / {{ channel.probeCount24h }} 次成功
              </small>
            </div>
            <div class="channel-metric">
              <span>最近延迟</span>
              <strong>{{ channel.lastProbe ? channel.lastProbe.latencyMs + ' ms' : '--' }}</strong>
            </div>
          </div>

          <ChannelLatencyChart
            :points="seriesByChannel[channel.id] ?? []"
            :rate-multiplier="channel.rateMultiplier"
          />

          <p v-if="channel.lastProbe && !channel.lastProbe.success" class="channel-error" :title="formatError(channel.lastProbe.error)">
            {{ formatError(channel.lastProbe.error) }}
          </p>
          <p v-else-if="channel.lastProbe?.warning" class="channel-warning" :title="formatWarning(channel.lastProbe.warning)">
            {{ formatWarning(channel.lastProbe.warning) }}
          </p>
          <div v-else class="channel-card__last">最近探测 {{ formatTime(channel.lastProbe?.checkedAt) }}</div>

          <div class="channel-card__footer" @click.stop>
            <div class="auto-control">
              <span>自动探测</span>
              <el-switch
                :model-value="channel.enabled"
                size="small"
                :aria-label="channel.name + ' 自动探测'"
                @change="(value: string | number | boolean) => emit('toggle', channel, Boolean(value))"
              />
            </div>
            <div class="card-actions">
              <el-tooltip content="立即探测" placement="top">
                <el-button
                  circle
                  text
                  :loading="busyId === channel.id"
                  :disabled="!channel.enabled"
                  :aria-label="'立即探测 ' + channel.name"
                  @click="emit('probe', channel)"
                >
                  <Play :size="16" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="编辑" placement="top">
                <el-button circle text :aria-label="'编辑 ' + channel.name" @click="emit('edit', channel)">
                  <Pencil :size="16" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button circle text type="danger" :aria-label="'删除 ' + channel.name" @click="emit('delete', channel)">
                  <Trash2 :size="16" />
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.channel-groups {
  display: grid;
  min-height: 238px;
  gap: 22px;
}

.channel-group {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.channel-group__header {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.channel-group__header h3 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.channel-group__header span {
  color: var(--muted);
  font-size: 11px;
}

.channel-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.channel-card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 390px;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  box-shadow: 0 10px 28px var(--section-shadow);
  transition: border-color 220ms ease, box-shadow 220ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.channel-card::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  background: var(--status-muted);
  content: '';
  opacity: 0.75;
}

.channel-card--success::before {
  background: var(--success);
}

.channel-card--warning::before,
.channel-card--pending::before {
  background: var(--warning);
}

.channel-card--danger::before {
  background: var(--danger);
}

.channel-card:hover,
.channel-card:focus-visible,
.channel-card--selected {
  border-color: var(--hover-border);
  box-shadow: 0 18px 40px var(--card-shadow);
  outline: none;
  transform: translateY(-3px);
}

.channel-card--selected {
  box-shadow: 0 0 0 2px var(--focus-ring), 0 18px 40px var(--card-shadow);
}

.channel-card--disabled {
  border-style: dashed;
  background: var(--surface-muted);
}

.channel-card--disabled .channel-title strong,
.channel-card--disabled .channel-metric strong {
  color: var(--muted);
}

.channel-card--disabled .channel-card__last,
.channel-card--disabled :deep(.latency-chart) {
  opacity: 0.72;
}

.channel-card:focus-visible {
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.channel-card__header,
.channel-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.channel-title {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 9px;
}

.channel-title__copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.channel-title strong {
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
}

.channel-title__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.channel-title__meta span {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.channel-title__meta :deep(.el-tag) {
  height: 20px;
  padding: 0 5px;
}

.status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--status-muted);
}

.status-dot--success {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--success-ring);
  animation: channel-pulse 2.4s ease-in-out infinite;
}

.status-dot--danger {
  background: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-ring);
}

.status-dot--pending {
  background: var(--warning);
  box-shadow: 0 0 0 3px var(--warning-ring);
}

.status-dot--warning {
  background: var(--warning);
  box-shadow: 0 0 0 3px var(--warning-ring);
}

.channel-card__last {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 0;
  border-top: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
}

.channel-metric {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.channel-metric span {
  color: var(--muted);
  font-size: 11px;
}

.channel-metric strong {
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: 17px;
  font-weight: 650;
}

.channel-metric small {
  color: var(--muted);
  font-size: 10px;
}

.metric-good {
  color: var(--success) !important;
}

.channel-error {
  min-height: 32px;
  margin: -2px 0 0;
  overflow: hidden;
  color: var(--danger);
  font-size: 11px;
  line-height: 1.45;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.channel-warning {
  min-height: 32px;
  margin: -2px 0 0;
  overflow: hidden;
  color: var(--warning);
  font-size: 11px;
  line-height: 1.45;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.channel-card__last {
  min-height: 32px;
  line-height: 1.45;
}

.channel-card__footer {
  margin-top: auto;
  padding-top: 2px;
}

.auto-control,
.card-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.auto-control span {
  color: var(--muted);
  font-size: 11px;
}

.card-actions :deep(.el-button) {
  width: 28px;
  height: 28px;
  margin: 0;
}

@keyframes channel-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--success-ring); }
  50% { box-shadow: 0 0 0 6px transparent; }
}

.channel-empty {
  width: 100%;
}

@media (max-width: 1120px) {
  .channel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .channel-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-dot--success {
    animation: none;
  }
}
</style>
