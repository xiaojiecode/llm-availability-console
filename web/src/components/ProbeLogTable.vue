<script setup lang="ts">
import { computed } from 'vue'
import type { Channel, Probe } from '../types'

const props = defineProps<{
  channels: Channel[]
  probes: Probe[]
}>()

const channelNames = computed(() =>
  new Map(props.channels.map((channel) => [channel.id, channel.name])),
)

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <el-table :data="probes" row-key="id" height="360" empty-text="暂无探测记录">
    <el-table-column label="时间" width="158">
      <template #default="{ row }">{{ formatTime(row.checkedAt) }}</template>
    </el-table-column>
    <el-table-column label="信道" min-width="140">
      <template #default="{ row }">{{ channelNames.get(row.channelId) ?? '#' + row.channelId }}</template>
    </el-table-column>
    <el-table-column label="结果" width="86">
      <template #default="{ row }">
        <el-tag :type="row.success ? 'success' : 'danger'" effect="light" size="small">
          {{ row.success ? '成功' : '失败' }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="HTTP" width="78" align="right">
      <template #default="{ row }">{{ row.statusCode || '--' }}</template>
    </el-table-column>
    <el-table-column label="延迟" width="94" align="right">
      <template #default="{ row }">{{ row.latencyMs + ' ms' }}</template>
    </el-table-column>
    <el-table-column label="错误" min-width="300" show-overflow-tooltip>
      <template #default="{ row }">
        <span :class="{ 'error-text': row.error }">{{ row.error || '--' }}</span>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.error-text {
  color: var(--danger);
}
</style>
