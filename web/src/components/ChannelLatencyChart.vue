<script setup lang="ts">
import { computed } from 'vue'
import type { SeriesPoint } from '../types'

const props = defineProps<{
  points: SeriesPoint[]
  rateMultiplier: number
}>()

const maxLatencyMs = 15_000
const visiblePoints = computed(() => props.points.slice(-24))

function barHeight(point: SeriesPoint) {
  return Math.min(Math.max((point.observedAvgLatencyMs / maxLatencyMs) * 100, point.observedAvgLatencyMs ? 4 : 1), 100)
}

function barTone(point: SeriesPoint) {
  if (!point.latestProbe?.success) return 'danger'
  if (point.latestProbe.warning) return 'warning'
  return 'success'
}

function formatBucket(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function tokenSummary(point: SeriesPoint) {
  const probe = point.latestProbe
  if (!probe || !probe.totalTokens) return '上游未提供'
  const parts = [
    '总计 ' + probe.totalTokens,
    '输入 ' + probe.promptTokens,
    '输出 ' + probe.completionTokens,
  ]
  if (probe.cachedTokens) parts.push('缓存 ' + probe.cachedTokens)
  if (probe.reasoningTokens) parts.push('推理 ' + probe.reasoningTokens)
  return parts.join(' · ')
}

function billingSummary(point: SeriesPoint) {
  const probe = point.latestProbe
  const rate = Number(props.rateMultiplier.toFixed(2)) + 'x'
  if (probe?.billedAmount === undefined) return '上游未提供金额 · 倍率 ' + rate
  const currency = probe.billingCurrency ? ' ' + probe.billingCurrency.toUpperCase() : ''
  return probe.billedAmount.toFixed(6) + currency + ' · 倍率 ' + rate
}

function responseContent(point: SeriesPoint) {
  const probe = point.latestProbe
  return probe?.responseExcerpt || probe?.error || '无响应内容'
}
</script>

<template>
  <div class="latency-chart" :aria-label="points.length ? '分钟平均延迟柱状图' : '暂无延迟趋势数据'">
    <div v-if="visiblePoints.length" class="latency-chart__body">
      <div class="latency-chart__axis" aria-hidden="true">
        <span>15s</span>
        <span>7.5s</span>
        <span>0</span>
      </div>
      <div class="latency-chart__plot">
        <div class="latency-chart__gridline latency-chart__gridline--top" />
        <div class="latency-chart__gridline latency-chart__gridline--middle" />
        <div class="latency-chart__gridline latency-chart__gridline--bottom" />
        <div class="latency-chart__bars">
          <el-tooltip
            v-for="point in visiblePoints"
            :key="point.bucket"
            :disabled="!point.latestProbe"
            placement="top"
            :show-after="120"
            :hide-after="50"
            popper-class="probe-detail-popper"
          >
            <template #content>
              <div v-if="point.latestProbe" class="probe-detail">
                <div class="probe-detail__header">
                  <strong>{{ formatBucket(point.latestProbe.checkedAt) }}</strong>
                  <span :class="point.latestProbe.success ? 'probe-detail__success' : 'probe-detail__error'">
                    {{ point.latestProbe.success ? '成功' : '失败' }}
                  </span>
                </div>
                <dl class="probe-detail__metrics">
                  <div><dt>HTTP</dt><dd>{{ point.latestProbe.statusCode || '--' }}</dd></div>
                  <div><dt>延迟</dt><dd>{{ point.latestProbe.latencyMs }} ms</dd></div>
                  <div><dt>调用数</dt><dd>{{ point.probeCount }}</dd></div>
                  <div class="probe-detail__wide"><dt>Token</dt><dd>{{ tokenSummary(point) }}</dd></div>
                  <div class="probe-detail__wide"><dt>计费</dt><dd>{{ billingSummary(point) }}</dd></div>
                </dl>
                <div v-if="point.latestProbe.requestBody" class="probe-detail__section">
                  <span>请求</span>
                  <pre>{{ point.latestProbe.requestBody }}</pre>
                </div>
                <div class="probe-detail__section">
                  <span>响应</span>
                  <pre>{{ responseContent(point) }}</pre>
                </div>
              </div>
            </template>
            <div
              :class="['latency-chart__bar', 'latency-chart__bar--' + barTone(point)]"
              :style="{ height: barHeight(point) + '%' }"
              :aria-label="formatBucket(point.bucket) + '，延迟 ' + Math.round(point.observedAvgLatencyMs) + ' 毫秒'"
              tabindex="0"
            />
          </el-tooltip>
        </div>
      </div>
    </div>
    <div v-else class="latency-chart__empty">暂无延迟数据</div>
  </div>
</template>

<style scoped>
.latency-chart {
  display: grid;
  min-height: 102px;
  padding: 10px 0 0;
}

.latency-chart__body {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 6px;
  min-height: 92px;
}

.latency-chart__axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 0 1px;
  color: var(--chart-label);
  font-size: 9px;
  line-height: 1;
  text-align: right;
}

.latency-chart__plot {
  position: relative;
  min-width: 0;
  border-bottom: 1px solid var(--chart-grid);
}

.latency-chart__gridline {
  position: absolute;
  right: 0;
  left: 0;
  border-top: 1px dashed var(--chart-grid);
}

.latency-chart__gridline--top {
  top: 0;
}

.latency-chart__gridline--middle {
  top: 50%;
}

.latency-chart__gridline--bottom {
  bottom: 0;
}

.latency-chart__bars {
  position: absolute;
  inset: 0 0 0;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  padding: 0 2px;
  z-index: 1;
}

.latency-chart__bar {
  min-width: 3px;
  flex: 1 1 0;
  border-radius: 2px 2px 0 0;
  opacity: 1;
  border: 1px solid rgb(0 0 0 / 12%);
  transform-origin: bottom;
  animation: bar-rise 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transition: height 180ms ease, opacity 180ms ease;
}

.latency-chart__bar:hover {
  opacity: 1;
}

.latency-chart__bar--success {
  background: var(--chart-success);
  box-shadow: 0 0 8px color-mix(in srgb, var(--chart-success) 34%, transparent);
}

.latency-chart__bar--warning {
  background: var(--chart-warning);
}

.latency-chart__bar--danger {
  background: var(--chart-danger);
}

@keyframes bar-rise {
  from { transform: scaleY(0); opacity: 0; }
  to { transform: scaleY(1); opacity: 0.9; }
}

.latency-chart__empty {
  display: grid;
  min-height: 92px;
  place-items: center;
  border: 1px dashed var(--border);
  color: var(--muted);
  font-size: 11px;
}

.probe-detail {
  display: grid;
  width: min(480px, calc(100vw - 48px));
  gap: 10px;
  padding: 2px;
  font-size: 12px;
}

.probe-detail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.probe-detail__success {
  color: #67c23a;
}

.probe-detail__error {
  color: #f56c6c;
}

.probe-detail__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 16px;
  margin: 0;
}

.probe-detail__metrics div {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 6px;
}

.probe-detail__metrics dt {
  color: #a8abb2;
}

.probe-detail__metrics dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.probe-detail__wide {
  grid-column: 1 / -1;
}

.probe-detail__section {
  display: grid;
  gap: 4px;
}

.probe-detail__section > span {
  color: #a8abb2;
}

.probe-detail__section pre {
  max-height: 150px;
  margin: 0;
  overflow: auto;
  padding: 8px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 4px;
  background: rgb(0 0 0 / 22%);
  font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

:global(.probe-detail-popper) {
  max-width: calc(100vw - 24px);
}

@media (prefers-reduced-motion: reduce) {
  .latency-chart__bar {
    animation: none;
  }
}
</style>
