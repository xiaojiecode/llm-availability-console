<script setup lang="ts">
import { reactive, shallowRef, useTemplateRef, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Braces } from '@lucide/vue'
import type { Channel, ChannelInput, Provider, RequestMethod } from '../types'
import { defaultProviderValues } from '../services/requestTemplates'
import { validateRequestTemplate } from '../services/probe'

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
const expandedSections = shallowRef(['request'])
const requestMethods: RequestMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const templateVariables = ['{{apiKey}}', '{{model}}', '{{baseUrl}}', '{{timestamp}}']
const openAiDefaults = defaultProviderValues('openai')
const form = reactive<ChannelInput>({
  name: '',
  provider: 'openai',
  baseUrl: openAiDefaults.baseUrl,
  apiKey: '',
  model: openAiDefaults.model,
  enabled: true,
  note: '',
  rateMultiplier: 1,
  proxyUrl: '',
  requestTemplate: openAiDefaults.requestTemplate,
})

const rules: FormRules<ChannelInput> = {
  name: [{ required: true, message: '请输入信道名称', trigger: 'blur' }],
  baseUrl: [
    { required: true, message: '请输入 Base URL', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          const url = new URL(String(value))
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
          callback()
        } catch {
          callback(new Error('请输入有效的 HTTP(S) 地址'))
        }
      },
      trigger: 'blur',
    },
  ],
  model: [{ required: true, message: '请输入探测模型', trigger: 'blur' }],
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const defaults = defaultProviderValues(props.channel?.provider ?? 'openai')
    Object.assign(form, {
      name: props.channel?.name ?? '',
      provider: props.channel?.provider ?? 'openai',
      baseUrl: props.channel?.baseUrl ?? defaults.baseUrl,
      apiKey: props.channel?.apiKey ?? '',
      model: props.channel?.model ?? defaults.model,
      enabled: props.channel?.enabled ?? true,
      note: props.channel?.note ?? '',
      rateMultiplier: props.channel?.rateMultiplier ?? 1,
      proxyUrl: props.channel?.proxyUrl ?? '',
      requestTemplate: { ...(props.channel?.requestTemplate ?? defaults.requestTemplate) },
    })
    formRef.value?.clearValidate()
  },
)

function handleProviderChange(value: string) {
  const provider = value as Provider
  const defaults = defaultProviderValues(provider)
  form.baseUrl = defaults.baseUrl
  form.model = defaults.model
  form.requestTemplate = { ...defaults.requestTemplate }
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    validateRequestTemplate(form.requestTemplate)
    if (form.proxyUrl && !form.proxyUrl.includes('{{url}}')) {
      throw new Error('代理 URL 必须包含 {{url}} 占位符')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '请求模板无效')
    return
  }
  emit('save', props.channel?.id ?? 0, {
    ...form,
    requestTemplate: { ...form.requestTemplate },
  })
}
</script>

<template>
  <el-dialog
    :model-value="open"
    :title="channel ? '编辑信道' : '新增信道'"
    width="min(720px, calc(100vw - 28px))"
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
            <el-option label="自定义协议" value="custom" />
          </el-select>
        </el-form-item>
      </div>

      <el-form-item label="Base URL" prop="baseUrl">
        <el-input v-model="form.baseUrl" placeholder="https://api.example.com" />
      </el-form-item>

      <el-form-item label="API Key">
        <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." autocomplete="new-password" />
      </el-form-item>

      <div class="form-grid">
        <el-form-item label="探测模型" prop="model">
          <el-input v-model="form.model" />
        </el-form-item>
        <el-form-item label="倍率">
          <el-input-number v-model="form.rateMultiplier" :min="0.01" :step="0.01" :precision="2" class="full-width" />
        </el-form-item>
      </div>

      <el-form-item label="CORS 代理 URL">
        <el-input v-model="form.proxyUrl" placeholder="https://proxy.example.com/?url={{url}}" clearable />
      </el-form-item>

      <el-collapse v-model="expandedSections" class="request-editor">
        <el-collapse-item name="request">
          <template #title>
            <span class="request-title"><Braces :size="16" /> 请求模板</span>
          </template>

          <div class="request-vars">
            <code v-for="variable in templateVariables" :key="variable" v-text="variable" />
          </div>

          <div class="request-line">
            <el-form-item label="方法">
              <el-select v-model="form.requestTemplate.method" class="method-select">
                <el-option v-for="method in requestMethods" :key="method" :label="method" :value="method" />
              </el-select>
            </el-form-item>
            <el-form-item label="请求路径" class="request-path">
              <el-input v-model="form.requestTemplate.path" placeholder="/v1/chat/completions" />
            </el-form-item>
          </div>

          <el-form-item label="Headers JSON">
            <el-input v-model="form.requestTemplate.headersJson" type="textarea" :rows="7" resize="vertical" class="code-input" />
          </el-form-item>
          <el-form-item v-if="!['GET', 'DELETE'].includes(form.requestTemplate.method)" label="Body JSON">
            <el-input v-model="form.requestTemplate.bodyJson" type="textarea" :rows="9" resize="vertical" class="code-input" />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>

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

.request-editor {
  margin: 4px 0 18px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0 14px;
}

.request-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text);
  font-weight: 650;
}

.request-vars {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 14px;
}

.request-vars code {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-muted);
  color: var(--primary);
  font-size: 11px;
}

.request-line {
  display: flex;
  gap: 12px;
}

.method-select {
  width: 112px;
}

.request-path {
  min-width: 0;
  flex: 1;
}

.code-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .request-line {
    flex-direction: column;
    gap: 0;
  }

  .method-select {
    width: 100%;
  }
}
</style>
