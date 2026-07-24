<script setup lang="ts">
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { CheckCheck, Repeat2 } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { Channel, SeriesPoint } from '../types'
import { groupChannels } from '../utils/channelGroup'

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  channels: Channel[]
  seriesByChannel: Record<number, SeriesPoint[]>
}>()
const mergeChannelGroups = defineModel<boolean>('mergeChannelGroups', { default: true })

const maxLatencyMs = 15_000
const palette = ['#22a88a', '#ef8a5b', '#4d83d1', '#d4a23d', '#c9607c', '#25a4b8', '#7a70c6', '#7e918d']
const chartRef = useTemplateRef<HTMLDivElement>('chart')
const selectedChannelIds = ref<Set<number>>(new Set())
const knownChannelIds = new Set<number>()
const channelGroups = computed(() => mergeChannelGroups.value
  ? [{ key: 'all', label: '全部渠道', channels: props.channels }]
  : groupChannels(props.channels))
const selectedCount = computed(() => selectedChannelIds.value.size)
const hasData = computed(() => props.channels.some(
  (channel) => selectedChannelIds.value.has(channel.id) && props.seriesByChannel[channel.id]?.length,
))
let chartInstance: EChartsType | undefined
let resizeObserver: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined

function formatBucket(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function channelColor(channel: Channel) {
  const index = props.channels.findIndex((item) => item.id === channel.id)
  return palette[(index < 0 ? 0 : index) % palette.length]
}

function toggleChannel(channelId: number, selected: boolean) {
  const next = new Set(selectedChannelIds.value)
  if (selected) next.add(channelId)
  else next.delete(channelId)
  selectedChannelIds.value = next
}

function selectAll() {
  selectedChannelIds.value = new Set(props.channels.map((channel) => channel.id))
}

function invertSelection() {
  selectedChannelIds.value = new Set(
    props.channels.filter((channel) => !selectedChannelIds.value.has(channel.id)).map((channel) => channel.id),
  )
}

function render() {
  if (!chartInstance) return
  const styles = getComputedStyle(document.documentElement)
  const chartLabel = styles.getPropertyValue('--chart-label').trim()
  const chartGrid = styles.getPropertyValue('--chart-grid').trim()
  const chartBorder = styles.getPropertyValue('--border').trim()
  const tooltipBackground = styles.getPropertyValue('--tooltip-bg').trim()
  const tooltipText = styles.getPropertyValue('--tooltip-text').trim()
  const buckets = [...new Set(
    props.channels.flatMap((channel) => (props.seriesByChannel[channel.id] ?? []).map((point) => point.bucket)),
  )].sort()
  const labels = buckets.map(formatBucket)
  const visibleChannels = props.channels.filter(
    (channel) => selectedChannelIds.value.has(channel.id) && props.seriesByChannel[channel.id]?.length,
  )
  const series = visibleChannels
    .map((channel) => {
      const pointsByBucket = new Map(
        (props.seriesByChannel[channel.id] ?? []).map((point) => [point.bucket, point]),
      )
      const color = channelColor(channel)
      const lineStyle = { color, width: channel.enabled ? 1.8 : 1, opacity: channel.enabled ? 0.9 : 0.35 }
      const common = {
        name: channel.name,
        type: 'line' as const,
        symbol: 'none',
        smooth: 0.18,
        connectNulls: false,
        lineStyle,
        itemStyle: { color },
        emphasis: { focus: 'series' as const, lineStyle: { width: 3 } },
      }
      return {
        ...common,
        data: buckets.map((bucket) => {
          const point = pointsByBucket.get(bucket)
          return point ? Math.min(Math.round(point.observedAvgLatencyMs), maxLatencyMs) : null
        }),
      }
    })

  chartInstance.setOption({
    animationDuration: 720,
    animationDurationUpdate: 420,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    color: palette,
    grid: { left: 18, right: 22, top: 30, bottom: 18, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      order: 'valueDesc',
      backgroundColor: tooltipBackground,
      borderWidth: 0,
      textStyle: { color: tooltipText, fontSize: 12 },
    },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: chartBorder } },
      axisTick: { show: false },
      axisLabel: { color: chartLabel, hideOverlap: true, margin: 12 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: maxLatencyMs,
      interval: 3000,
      axisLabel: {
        color: chartLabel,
        formatter: (value: number) => value === 0 ? '0' : value / 1000 + 's',
      },
      splitLine: { lineStyle: { color: chartGrid } },
    },
    series,
  }, true)
}

onMounted(() => {
  if (!chartRef.value) return
  chartInstance = init(chartRef.value)
  resizeObserver = new ResizeObserver(() => chartInstance?.resize())
  resizeObserver.observe(chartRef.value)
  themeObserver = new MutationObserver(render)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  render()
})

watch([() => props.channels, () => props.seriesByChannel], render)

watch(
  () => props.channels.map((channel) => channel.id),
  (channelIds) => {
    const next = new Set([...selectedChannelIds.value].filter((id) => channelIds.includes(id)))
    for (const channelId of channelIds) {
      if (!knownChannelIds.has(channelId)) next.add(channelId)
      knownChannelIds.add(channelId)
    }
    selectedChannelIds.value = next
  },
  { immediate: true },
)

watch(selectedChannelIds, render)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  chartInstance?.dispose()
})
</script>

<template>
  <div class="chart-wrap">
    <div class="chart-controls">
      <div class="chart-controls__summary">
        <span>曲线</span>
        <strong>{{ selectedCount }} / {{ channels.length }}</strong>
        <el-button size="small" plain @click="selectAll">
          <CheckCheck :size="14" />
          全选
        </el-button>
        <el-button size="small" plain @click="invertSelection">
          <Repeat2 :size="14" />
          反选
        </el-button>
        <label class="chart-controls__merge">
          <span>合并渠道</span>
          <el-switch v-model="mergeChannelGroups" size="small" />
        </label>
      </div>
      <div class="chart-groups">
        <div v-for="group in channelGroups" :key="group.key" class="chart-group">
          <span class="chart-group__label">{{ group.label }}</span>
          <div class="chart-group__items">
            <el-checkbox
              v-for="channel in group.channels"
              :key="channel.id"
              :model-value="selectedChannelIds.has(channel.id)"
              :title="channel.name"
              @change="(value: string | number | boolean) => toggleChannel(channel.id, Boolean(value))"
            >
              <span class="channel-option">
                <i :style="{ backgroundColor: channelColor(channel), boxShadow: '0 0 8px ' + channelColor(channel) }" />
                <span>{{ channel.name }}</span>
              </span>
            </el-checkbox>
          </div>
        </div>
      </div>
    </div>
    <div ref="chart" class="chart" />
    <el-empty v-if="!hasData" class="chart-empty" description="暂无趋势数据" :image-size="56" />
  </div>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  min-width: 0;
}

.chart {
  width: 100%;
  height: 470px;
}

.chart-controls {
  display: grid;
  min-width: 0;
  gap: 10px;
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--surface-muted);
}

.chart-controls__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
}

.chart-controls__summary strong {
  margin-right: auto;
  color: var(--text);
  font-weight: 650;
}

.chart-controls__summary :deep(.el-button + .el-button) {
  margin-left: 0;
}

.chart-controls__merge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 12px;
}

.chart-groups {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.chart-group {
  display: grid;
  min-width: 0;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}

.chart-group__label {
  overflow: hidden;
  padding-top: 3px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-group__items {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.chart-group__items :deep(.el-checkbox) {
  max-width: min(260px, 100%);
  height: 24px;
  margin-right: 0;
}

.chart-group__items :deep(.el-checkbox__label) {
  min-width: 0;
  padding-left: 5px;
}

.channel-option {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
}

.channel-option i {
  width: 12px;
  height: 3px;
  flex: 0 0 12px;
  border-radius: 2px;
}

.channel-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-empty {
  position: absolute;
  inset: auto 0 0;
  height: 470px;
  background: var(--empty-overlay);
}

@media (max-width: 560px) {
  .chart-group {
    grid-template-columns: 1fr;
    gap: 3px;
  }

  .chart-group__label {
    white-space: normal;
  }
}
</style>
