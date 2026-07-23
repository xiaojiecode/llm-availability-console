<script setup lang="ts">
import { Activity, Gauge, RadioTower, ShieldCheck } from '@lucide/vue'
import type { Component } from 'vue'
import type { Summary } from '../types'

const props = defineProps<{ summary: Summary }>()

interface StatItem {
  key: string
  label: string
  value: string
  meta: string
  icon: Component
  tone: string
}

function formatLatency(value: number) {
  return value ? Math.round(value) + ' ms' : '--'
}

const items = (): StatItem[] => [
  {
    key: 'channels',
    label: '启用信道',
    value: String(props.summary.enabledChannels),
    meta: '共 ' + props.summary.totalChannels + ' 个配置',
    icon: RadioTower,
    tone: 'teal',
  },
  {
    key: 'healthy',
    label: '当前可用',
    value: String(props.summary.healthyChannels),
    meta: '最近一次探测',
    icon: ShieldCheck,
    tone: 'green',
  },
  {
    key: 'availability',
    label: '24h 可用率',
    value: props.summary.recentAvailability.toFixed(1) + '%',
    meta: '全部已记录请求',
    icon: Activity,
    tone: 'amber',
  },
  {
    key: 'latency',
    label: '24h 平均延迟',
    value: formatLatency(props.summary.averageLatencyMs),
    meta: '仅统计成功请求',
    icon: Gauge,
    tone: 'red',
  },
]
</script>

<template>
  <div class="stats-grid">
    <article v-for="item in items()" :key="item.key" class="stat-tile">
      <div :class="['stat-icon', 'stat-icon--' + item.tone]">
        <component :is="item.icon" :size="20" />
      </div>
      <div class="stat-copy">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
        <span class="stat-meta">{{ item.meta }}</span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-tile {
  display: flex;
  min-width: 0;
  min-height: 116px;
  align-items: flex-start;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
}

.stat-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 6px;
}

.stat-icon--teal {
  color: #176f78;
  background: #e2f2f3;
}

.stat-icon--green {
  color: #167551;
  background: #e4f3eb;
}

.stat-icon--amber {
  color: #a36a12;
  background: #f8eed8;
}

.stat-icon--red {
  color: #ad4141;
  background: #f9e5e3;
}

.stat-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.stat-label,
.stat-meta {
  color: var(--muted);
  font-size: 12px;
}

.stat-value {
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: 25px;
  font-weight: 650;
  line-height: 1.2;
}

@media (max-width: 960px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 540px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
