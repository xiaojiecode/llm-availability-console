<script setup lang="ts">
import { Pencil, Play, Trash2 } from '@lucide/vue'
import type { Channel } from '../types'

defineProps<{
  channels: Channel[]
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

function providerLabel(provider: Channel['provider']) {
  return provider === 'anthropic' ? 'Claude' : 'OpenAI'
}

function status(channel: Channel) {
  if (!channel.enabled) return { label: '已停用', tone: 'muted' }
  if (!channel.lastProbe) return { label: '待探测', tone: 'pending' }
  return channel.lastProbe.success
    ? { label: '可用', tone: 'success' }
    : { label: '异常', tone: 'danger' }
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
  return channel.probeCount24h ? channel.availability.toFixed(1) + '%' : '--'
}

function selectCard(id: number) {
  emit('select', id)
}
</script>

<template>
  <div v-loading="loading" class="channel-grid" aria-live="polite">
    <el-empty v-if="!channels.length" class="channel-empty" description="暂无信道" />
    <article
      v-for="channel in channels"
      :key="channel.id"
      :class="['channel-card', { 'channel-card--selected': selectedChannelId === channel.id }]"
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
            <span>{{ providerLabel(channel.provider) }} · {{ channel.model }}</span>
          </div>
        </div>
        <el-tag :type="status(channel).tone === 'success' ? 'success' : status(channel).tone === 'danger' ? 'danger' : status(channel).tone === 'pending' ? 'warning' : 'info'" effect="light" size="small">
          {{ status(channel).label }}
        </el-tag>
      </div>

      <div class="channel-card__url" :title="channel.baseUrl">{{ channel.baseUrl }}</div>

      <div class="channel-metrics">
        <div class="channel-metric">
          <span>24h 可用率</span>
          <strong :class="{ 'metric-good': channel.probeCount24h && channel.availability >= 99 }">
            {{ formatAvailability(channel) }}
          </strong>
        </div>
        <div class="channel-metric">
          <span>最近延迟</span>
          <strong>{{ channel.lastProbe ? channel.lastProbe.latencyMs + ' ms' : '--' }}</strong>
        </div>
      </div>

      <p v-if="channel.lastProbe && !channel.lastProbe.success" class="channel-error" :title="channel.lastProbe.error">
        {{ channel.lastProbe.error || '探测失败' }}
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
</template>

<style scoped>
.channel-grid {
  display: grid;
  min-height: 238px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.channel-card {
  display: flex;
  min-width: 0;
  min-height: 238px;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.channel-card:hover,
.channel-card:focus-visible,
.channel-card--selected {
  border-color: #8fc9ba;
  box-shadow: 0 5px 16px rgba(20, 70, 64, 0.08);
  outline: none;
}

.channel-card:focus-visible {
  box-shadow: 0 0 0 3px rgba(22, 125, 115, 0.18);
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

.channel-title span:last-child {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: #a6b2ba;
}

.status-dot--success {
  background: var(--success);
  box-shadow: 0 0 0 3px rgba(22, 135, 101, 0.12);
}

.status-dot--danger {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgba(201, 70, 70, 0.12);
}

.status-dot--pending {
  background: var(--warning);
  box-shadow: 0 0 0 3px rgba(185, 119, 22, 0.12);
}

.channel-card__url,
.channel-card__last {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid #edf0f2;
  border-bottom: 1px solid #edf0f2;
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

.channel-empty {
  grid-column: 1 / -1;
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
</style>
