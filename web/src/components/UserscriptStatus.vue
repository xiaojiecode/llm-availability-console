<script setup lang="ts">
import { computed } from 'vue'
import { LoaderCircle, PlugZap } from '@lucide/vue'
import type { UserscriptStatus } from '../services/userscript'

const props = defineProps<{
  status: UserscriptStatus
}>()

const emit = defineEmits<{
  recheck: []
}>()

const label = computed(() => {
  if (props.status === 'connected') return '油猴已连接'
  if (props.status === 'checking') return '检测油猴'
  return '油猴未连接'
})
</script>

<template>
  <el-tooltip content="油猴跨域请求桥连接状态，点击重新检测" placement="bottom">
    <button
      type="button"
      class="userscript-status"
      :class="`userscript-status--${status}`"
      :aria-label="label"
      @click="emit('recheck')"
    >
      <LoaderCircle v-if="status === 'checking'" class="userscript-status__spinner" :size="15" />
      <PlugZap v-else :size="15" />
      <span>{{ label }}</span>
    </button>
  </el-tooltip>
</template>

<style scoped>
.userscript-status {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgb(126 185 174 / 28%);
  border-radius: 7px;
  background: rgb(255 255 255 / 4%);
  color: #dcece8;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.userscript-status--connected {
  border-color: rgb(95 225 181 / 45%);
  color: #7ee7c4;
}

.userscript-status--unavailable {
  border-color: rgb(239 148 109 / 42%);
  color: #f2a684;
}

.userscript-status:focus-visible {
  outline: 2px solid #59d8bd;
  outline-offset: 2px;
}

.userscript-status__spinner {
  animation: userscript-spin 0.9s linear infinite;
}

@keyframes userscript-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .userscript-status__spinner { animation: none; }
}
</style>
