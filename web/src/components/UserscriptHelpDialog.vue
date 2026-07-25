<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Copy, ExternalLink, FileCode2, LoaderCircle } from '@lucide/vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const scriptContent = shallowRef('')
const loading = shallowRef(false)
const loadError = shallowRef('')
const copied = shallowRef(false)
const scriptFieldRef = useTemplateRef<HTMLTextAreaElement>('scriptField')
let copyResetTimer: number | undefined

const scriptUrl = computed(() => new URL(
  `${import.meta.env.BASE_URL}llmping.user.js`,
  window.location.origin,
).toString())

async function loadScript() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(scriptUrl.value, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    scriptContent.value = await response.text()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '脚本加载失败'
  } finally {
    loading.value = false
  }
}

async function copyScript() {
  if (!scriptContent.value) return
  try {
    await navigator.clipboard.writeText(scriptContent.value)
  } catch {
    const field = scriptFieldRef.value
    if (!field) return
    field.focus()
    field.select()
    if (!document.execCommand('copy')) {
      ElMessage.error('复制失败，请在脚本框中全选复制')
      return
    }
  }

  copied.value = true
  ElMessage.success('油猴脚本已复制')
  if (copyResetTimer) window.clearTimeout(copyResetTimer)
  copyResetTimer = window.setTimeout(() => {
    copied.value = false
  }, 1_800)
}

watch(() => props.open, (open) => {
  if (open && !scriptContent.value) void loadScript()
})
</script>

<template>
  <el-dialog
    :model-value="open"
    title="油猴跨域请求桥"
    width="min(760px, calc(100vw - 28px))"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="help-body">
      <ol class="install-steps">
        <li><span>1</span><p><strong>启用 Tampermonkey</strong><small>扩展的网站访问权限需设为“所有网站”。</small></p></li>
        <li><span>2</span><p><strong>确认安装脚本</strong><small>打开链接后仍需在 Tampermonkey 确认页点击“安装”。</small></p></li>
        <li><span>3</span><p><strong>刷新观测台</strong><small>页面顶部显示“油猴已连接”后即可跨域探测。</small></p></li>
      </ol>

      <el-alert
        title="安装页没有出现？"
        type="info"
        :closable="false"
      >
        <template #default>
          若新标签页停在 Tampermonkey 的 Script Installation 中转页，请确认扩展已启用；也可以复制下方脚本，在 Tampermonkey 管理面板中新建脚本并保存。
        </template>
      </el-alert>

      <div class="script-actions">
        <div>
          <FileCode2 :size="18" />
          <span>llmping.user.js</span>
        </div>
        <div>
          <el-button tag="a" :href="scriptUrl" target="_blank" rel="noopener noreferrer">
            <ExternalLink :size="15" />
            打开安装
          </el-button>
          <el-button type="primary" :disabled="!scriptContent" @click="copyScript">
            <Check v-if="copied" :size="15" />
            <Copy v-else :size="15" />
            {{ copied ? '已复制' : '复制脚本' }}
          </el-button>
        </div>
      </div>

      <div v-if="loading" class="script-state">
        <LoaderCircle class="script-state__spinner" :size="18" />
        正在读取脚本
      </div>
      <el-alert
        v-else-if="loadError"
        :title="`脚本加载失败：${loadError}`"
        type="error"
        show-icon
        :closable="false"
      >
        <template #default>
          <el-button size="small" @click="loadScript">重新加载</el-button>
        </template>
      </el-alert>
      <textarea
        v-else
        ref="scriptField"
        class="script-source"
        :value="scriptContent"
        readonly
        spellcheck="false"
        aria-label="油猴脚本源码"
      />
    </div>
  </el-dialog>
</template>

<style scoped>
.help-body {
  display: grid;
  gap: 16px;
}

.install-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.install-steps li {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-muted);
}

.install-steps li > span {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  place-items: center;
  border-radius: 50%;
  background: var(--success-soft);
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
}

.install-steps p {
  display: grid;
  min-width: 0;
  gap: 4px;
  margin: 0;
}

.install-steps strong {
  color: var(--text);
  font-size: 13px;
}

.install-steps small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
}

.script-actions,
.script-actions > div {
  display: flex;
  align-items: center;
}

.script-actions {
  justify-content: space-between;
  gap: 12px;
}

.script-actions > div {
  min-width: 0;
  gap: 8px;
}

.script-actions > div:first-child {
  color: var(--text);
  font: 600 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
}

.script-source,
.script-state {
  width: 100%;
  height: min(390px, 45vh);
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #0b1415;
  color: #dcece8;
}

.script-source {
  display: block;
  resize: vertical;
  padding: 14px;
  font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: pre;
}

.script-source:focus {
  border-color: var(--primary);
  outline: 0;
}

.script-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #9bb5b0;
  font-size: 12px;
}

.script-state__spinner {
  animation: script-spin 0.9s linear infinite;
}

@keyframes script-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 680px) {
  .install-steps {
    grid-template-columns: 1fr;
  }

  .script-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .script-actions > div:last-child {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .script-state__spinner { animation: none; }
}
</style>
