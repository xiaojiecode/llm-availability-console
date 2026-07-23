<script setup lang="ts">
import { reactive, useTemplateRef, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { Channel, ChannelInput, Provider } from '../types'

const props = defineProps<{
  open: boolean
  channel?: Channel
  saving: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [id: number, payload: ChannelInput]
}>()

const formRef = useTemplateRef<FormInstance>('form')
const form = reactive<ChannelInput>({
  name: '',
  provider: 'openai',
  baseUrl: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-5.6-lune',
  enabled: true,
  note: '',
})

const rules: FormRules<ChannelInput> = {
  name: [{ required: true, message: '请输入信道名称', trigger: 'blur' }],
  baseUrl: [
    { required: true, message: '请输入 Base URL', trigger: 'blur' },
    { type: 'url', message: '请输入完整 URL', trigger: 'blur' },
  ],
  apiKey: [{
    validator: (_rule, value, callback) => {
      if (!props.channel && !value) callback(new Error('请输入 API Key'))
      else callback()
    },
    trigger: 'blur',
  }],
  model: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, {
      name: props.channel?.name ?? '',
      provider: props.channel?.provider ?? 'openai',
      baseUrl: props.channel?.baseUrl ?? 'https://api.openai.com',
      apiKey: '',
      model: props.channel?.model ?? 'gpt-5.6-lune',
      enabled: props.channel?.enabled ?? true,
      note: props.channel?.note ?? '',
    })
    formRef.value?.clearValidate()
  },
)

function handleProviderChange(provider: Provider) {
  if (provider === 'anthropic') {
    form.baseUrl = 'https://api.anthropic.com'
    form.model = 'claude-3-7-sonnet-latest'
  } else {
    form.baseUrl = 'https://api.openai.com'
    form.model = 'gpt-5.6-lune'
  }
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('save', props.channel?.id ?? 0, { ...form })
}
</script>

<template>
  <el-dialog
    :model-value="open"
    :title="channel ? '编辑信道' : '新增信道'"
    width="min(560px, calc(100vw - 28px))"
    destroy-on-close
    @close="emit('close')"
  >
    <el-form ref="form" :model="form" :rules="rules" label-position="top">
      <div class="form-grid">
        <el-form-item label="信道名称" prop="name">
          <el-input v-model="form.name" placeholder="主线路" />
        </el-form-item>
        <el-form-item label="协议类型" prop="provider">
          <el-select v-model="form.provider" class="full-width" @change="handleProviderChange">
            <el-option label="OpenAI 兼容" value="openai" />
            <el-option label="Anthropic Claude" value="anthropic" />
          </el-select>
        </el-form-item>
      </div>
      <el-form-item label="Base URL" prop="baseUrl">
        <el-input v-model="form.baseUrl" placeholder="https://api.example.com" />
      </el-form-item>
      <el-form-item label="API Key" prop="apiKey">
        <el-input
          v-model="form.apiKey"
          type="password"
          show-password
          :placeholder="channel?.apiKeySet ? '留空则保留原密钥' : 'sk-...'"
          autocomplete="new-password"
        />
      </el-form-item>
      <div class="form-grid">
        <el-form-item label="探测模型" prop="model">
          <el-input v-model="form.model" />
        </el-form-item>
        <el-form-item label="最大输出">
          <el-input model-value="1 token" disabled />
        </el-form-item>
      </div>
      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="2" maxlength="200" show-word-limit />
      </el-form-item>
      <el-form-item label="自动探测">
        <el-switch v-model="form.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.full-width {
  width: 100%;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
