<script setup lang="ts">
import { Activity, Gauge, RadioTower, ShieldCheck } from '@lucide/vue'
import { computed, type Component } from 'vue'
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

const items = computed<StatItem[]>(() => [
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
    label: '24h 综合可用率',
    value: props.summary.totalChannels ? props.summary.recentAvailability.toFixed(2) + '%' : '--',
    meta: '全部已启用信道',
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
])
</script>

<template>
  <div class="stats-grid">
    <article v-for="item in items" :key="item.key" class="stat-tile">
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
  gap: 14px;
}

.stat-tile {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 126px;
  align-items: flex-start;
  gap: 14px;
  overflow: hidden;
  padding: 20px 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 12px 30px var(--section-shadow);
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms ease, box-shadow 220ms ease;
}

.stat-tile::after {
  position: absolute;
  right: -18px;
  bottom: -32px;
  width: 84px;
  height: 84px;
  border: 1px solid var(--border-soft);
  border-radius: 50%;
  content: '';
  opacity: 0.58;
}

.stat-tile:hover {
  border-color: var(--hover-border);
  box-shadow: 0 18px 38px var(--card-shadow);
  transform: translateY(-3px);
}

.stat-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 7px;
  transition: transform 220ms ease;
}

.stat-tile:hover .stat-icon {
  transform: scale(1.06) rotate(-3deg);
}

.stat-icon--teal {
  color: var(--stat-teal);
  background: var(--stat-teal-bg);
}

.stat-icon--green {
  color: var(--stat-green);
  background: var(--stat-green-bg);
}

.stat-icon--amber {
  color: var(--stat-amber);
  background: var(--stat-amber-bg);
}

.stat-icon--red {
  color: var(--stat-red);
  background: var(--stat-red-bg);
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
  font: 700 25px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
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
