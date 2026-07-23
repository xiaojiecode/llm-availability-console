<script setup lang="ts">
import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { SeriesPoint } from '../types'

const props = defineProps<{
  points: SeriesPoint[]
}>()

const chartRef = useTemplateRef<HTMLDivElement>('chart')
let chart: echarts.ECharts | undefined
let resizeObserver: ResizeObserver | undefined

function formatBucket(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function render() {
  if (!chart) return
  const labels = props.points.map((point) => formatBucket(point.bucket))
  chart.setOption({
    animationDuration: 300,
    grid: { left: 50, right: 52, top: 36, bottom: 42 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#17212b',
      borderWidth: 0,
      textStyle: { color: '#ffffff', fontSize: 12 },
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 16,
      itemHeight: 4,
      textStyle: { color: '#63717e' },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#dce2e7' } },
      axisTick: { show: false },
      axisLabel: { color: '#71808d', hideOverlap: true },
    },
    yAxis: [
      {
        type: 'value',
        name: '可用率',
        min: 0,
        max: 100,
        axisLabel: { formatter: '{value}%', color: '#71808d' },
        splitLine: { lineStyle: { color: '#edf0f2' } },
      },
      {
        type: 'value',
        name: '延迟',
        axisLabel: { formatter: '{value}ms', color: '#71808d' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '可用率',
        type: 'line',
        data: props.points.map((point) => Number(point.successRate.toFixed(1))),
        yAxisIndex: 0,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: props.points.length < 60,
        lineStyle: { color: '#168765', width: 2 },
        itemStyle: { color: '#168765' },
      },
      {
        name: '平均延迟',
        type: 'line',
        data: props.points.map((point) => Math.round(point.avgLatencyMs)),
        yAxisIndex: 1,
        symbol: 'none',
        lineStyle: { color: '#d18a1d', width: 2 },
        itemStyle: { color: '#d18a1d' },
      },
    ],
  }, true)
}

onMounted(() => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartRef.value)
  render()
})

watch(() => props.points, render)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div class="chart-wrap">
    <div ref="chart" class="chart" />
    <el-empty v-if="!points.length" class="chart-empty" description="暂无趋势数据" :image-size="56" />
  </div>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  min-height: 330px;
}

.chart {
  width: 100%;
  height: 330px;
}

.chart-empty {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
}
</style>
