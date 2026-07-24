<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { normalizeProxyUrl } from '../services/probe'

const props = defineProps<{
  open: boolean
  value: string
  saving: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [value: string]
}>()

const proxyUrl = shallowRef('')

watch(() => props.open, (open) => {
  if (open) proxyUrl.value = props.value
})

function submit() {
  try {
    emit('save', normalizeProxyUrl(proxyUrl.value))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '代理 URL 无效')
  }
}
</script>

<template>
  <el-dialog
    :model-value="open"
    title="统一跨域代理"
    width="min(560px, calc(100vw - 28px))"
    destroy-on-close
    @close="emit('close')"
  >
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="代理 URL">
        <el-input
          v-model="proxyUrl"
          type="password"
          show-password
          clearable
          autocomplete="off"
          placeholder="https://proxy.example.workers.dev/?token=...&url={{url}}"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
