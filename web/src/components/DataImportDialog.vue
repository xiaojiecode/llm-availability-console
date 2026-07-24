<script setup lang="ts">
import { shallowRef, useTemplateRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { FileJson, Upload } from '@lucide/vue'
import type { ImportMode } from '../types'

const props = defineProps<{
  open: boolean
  importing: boolean
}>()

const emit = defineEmits<{
  close: []
  import: [payload: unknown, mode: ImportMode]
}>()

const pickerRef = useTemplateRef<HTMLInputElement>('picker')
const selectedFile = shallowRef<File>()
const mode = shallowRef<ImportMode>('merge')

watch(() => props.open, (open) => {
  if (!open) return
  selectedFile.value = undefined
  mode.value = 'merge'
  if (pickerRef.value) pickerRef.value.value = ''
})

function selectFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0]
}

async function submit() {
  if (!selectedFile.value) return
  try {
    const payload = JSON.parse(await selectedFile.value.text()) as unknown
    emit('import', payload, mode.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? `读取失败：${error.message}` : '读取备份失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="open"
    title="导入本地备份"
    width="min(480px, calc(100vw - 28px))"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="import-body">
      <input ref="picker" class="file-picker" type="file" accept="application/json,.json" @change="selectFile" />
      <div class="file-row">
        <el-button @click="pickerRef?.click()">
          <Upload :size="16" />
          选择 JSON
        </el-button>
        <span v-if="selectedFile" class="file-name"><FileJson :size="16" />{{ selectedFile.name }}</span>
        <span v-else class="file-empty">未选择文件</span>
      </div>

      <el-form-item label="导入方式" class="mode-field">
        <el-radio-group v-model="mode">
          <el-radio-button value="merge">合并</el-radio-button>
          <el-radio-button value="replace">覆盖</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :disabled="!selectedFile" :loading="importing" @click="submit">导入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-body {
  display: grid;
  gap: 20px;
}

.file-picker {
  display: none;
}

.file-row,
.file-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.file-name {
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-empty {
  color: var(--muted);
  font-size: 12px;
}

.mode-field {
  margin-bottom: 0;
}
</style>
