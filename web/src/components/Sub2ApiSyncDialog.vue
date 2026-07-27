<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Clipboard, RefreshCcw } from '@lucide/vue'
import Sub2ApiCaptcha from './Sub2ApiCaptcha.vue'
import {
  getSub2ApiPublicSettings,
  normalizeSub2ApiOrigin,
  type Sub2ApiPublicSettings,
  type Sub2ApiSyncInput,
  type Sub2ApiSyncResult,
  type Sub2ApiTwoFactorChallenge,
} from '../services/sub2api'

const props = defineProps<{
  open: boolean
  syncing: boolean
  result?: Sub2ApiSyncResult
  challenge?: Sub2ApiTwoFactorChallenge
  error?: string
  recoveryRefreshToken?: string
}>()

const emit = defineEmits<{
  close: []
  submit: [input: Sub2ApiSyncInput]
  reset: []
}>()

const form = reactive({
  site: 'https://lucen.cc',
  authMode: 'refresh_token' as 'refresh_token' | 'account',
  refreshToken: '',
  email: '',
  password: '',
  captchaToken: '',
  totpCode: '',
})
const settings = shallowRef<Sub2ApiPublicSettings>()
const inspecting = shallowRef(false)
const inspectError = shallowRef('')
const captchaError = shallowRef('')
const settingsOrigin = shallowRef('')
const captchaRef = shallowRef<InstanceType<typeof Sub2ApiCaptcha>>()

const captchaEnabled = computed(() => Boolean(settings.value?.captcha_enabled ?? settings.value?.turnstile_enabled))
const captchaProvider = computed(() => settings.value?.captcha_provider || 'turnstile')
const captchaSiteKey = computed(() => settings.value?.captcha_site_key || settings.value?.turnstile_site_key || '')
const captchaApiEndpoint = computed(() => settings.value?.captcha_api_endpoint || '')
const canSubmit = computed(() => {
  if (props.syncing) return false
  if (props.challenge) return /^\d{6}$/.test(form.totpCode.trim())
  if (form.authMode === 'refresh_token') return Boolean(form.site.trim() && form.refreshToken.trim())
  let currentOrigin = ''
  try { currentOrigin = normalizeSub2ApiOrigin(form.site) } catch { return false }
  return Boolean(
    form.site.trim()
    && settings.value
    && settingsOrigin.value === currentOrigin
    && form.email.trim()
    && form.password
    && (!captchaEnabled.value || form.captchaToken),
  )
})

watch(() => props.open, (open) => {
  if (open) {
    if (!settings.value) void inspectSite()
    return
  }
  form.refreshToken = ''
  form.password = ''
  form.captchaToken = ''
  form.totpCode = ''
  captchaError.value = ''
})

watch(() => form.authMode, () => {
  form.captchaToken = ''
  captchaError.value = ''
  captchaRef.value?.reset()
})

watch(() => props.error, (error) => {
  if (!error || form.authMode !== 'account' || props.challenge) return
  form.captchaToken = ''
  captchaRef.value?.reset()
})

watch(() => props.challenge, (challenge) => {
  if (!challenge) return
  form.password = ''
  form.captchaToken = ''
  captchaError.value = ''
  captchaRef.value?.reset()
})

watch(() => props.result, (result) => {
  if (!result) return
  form.refreshToken = ''
  form.password = ''
  form.captchaToken = ''
  form.totpCode = ''
  captchaError.value = ''
  captchaRef.value?.reset()
})

async function inspectSite() {
  inspecting.value = true
  inspectError.value = ''
  form.captchaToken = ''
  try {
    const result = await getSub2ApiPublicSettings(form.site)
    form.site = result.origin
    settings.value = result.settings
    settingsOrigin.value = result.origin
  } catch (error) {
    settings.value = undefined
    settingsOrigin.value = ''
    inspectError.value = error instanceof Error ? error.message : '站点检测失败'
  } finally {
    inspecting.value = false
  }
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    site: form.site,
    authMode: form.authMode,
    refreshToken: form.authMode === 'refresh_token' ? form.refreshToken : undefined,
    email: form.authMode === 'account' ? form.email : undefined,
    password: form.authMode === 'account' ? form.password : undefined,
    captchaToken: form.authMode === 'account' ? form.captchaToken : undefined,
    tempToken: props.challenge?.tempToken,
    totpCode: props.challenge ? form.totpCode : undefined,
  })
}

function handleCaptchaError(message: string) {
  form.captchaToken = ''
  captchaError.value = message
}

async function copyRefreshToken() {
  const token = props.result?.rotatedRefreshToken || props.recoveryRefreshToken
  if (!token) return
  await navigator.clipboard.writeText(token)
  ElMessage.success('新的 refresh token 已复制')
}

function resetFlow() {
  form.password = ''
  form.captchaToken = ''
  form.totpCode = ''
  captchaError.value = ''
  captchaRef.value?.reset()
  emit('reset')
}
</script>

<template>
  <el-dialog
    :model-value="open"
    title="同步 sub2api 中转站"
    width="min(640px, calc(100vw - 28px))"
    destroy-on-close
    @close="emit('close')"
  >
    <div v-if="result" class="sync-result">
      <div class="result-heading">
        <span class="result-icon"><Check :size="20" /></span>
        <div>
          <strong>{{ result.siteName }}</strong>
          <span>{{ result.origin }}</span>
        </div>
      </div>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="可用分组">{{ result.groupCount }}</el-descriptions-item>
        <el-descriptions-item label="新建密钥">{{ result.createdKeyCount }}</el-descriptions-item>
        <el-descriptions-item label="复用密钥">{{ result.reusedKeyCount }}</el-descriptions-item>
        <el-descriptions-item label="新增信道">{{ result.createdChannelCount }}</el-descriptions-item>
        <el-descriptions-item label="更新信道">{{ result.updatedChannelCount }}</el-descriptions-item>
        <el-descriptions-item label="停用旧分组">{{ result.disabledChannelCount }}</el-descriptions-item>
      </el-descriptions>
      <el-form-item v-if="result.rotatedRefreshToken" label="新的 refresh token" class="rotated-token">
        <el-input :model-value="result.rotatedRefreshToken" type="password" show-password readonly>
          <template #append>
            <el-button aria-label="复制新的 refresh token" @click="copyRefreshToken"><Clipboard :size="16" /></el-button>
          </template>
        </el-input>
      </el-form-item>
    </div>

    <el-form v-else label-position="top" @submit.prevent="submit">
      <el-form-item label="中转站地址">
        <el-input v-model="form.site" placeholder="https://lucen.cc" @blur="inspectSite">
          <template #append>
            <el-button :loading="inspecting" aria-label="检测站点" @click="inspectSite"><RefreshCcw :size="16" /></el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-alert v-if="inspectError" :title="inspectError" type="error" show-icon :closable="false" class="form-alert" />

      <template v-if="challenge">
        <el-alert
          :title="challenge.maskedEmail ? `请输入 ${challenge.maskedEmail} 的动态验证码` : '请输入动态验证码'"
          type="warning"
          show-icon
          :closable="false"
          class="form-alert"
        />
        <el-form-item label="动态验证码">
          <el-input v-model="form.totpCode" maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
        </el-form-item>
      </template>

      <template v-else>
        <el-form-item label="登录方式">
          <el-segmented v-model="form.authMode" :options="[
            { label: 'Refresh Token', value: 'refresh_token' },
            { label: '账号密码', value: 'account' },
          ]" block />
        </el-form-item>

        <el-form-item v-if="form.authMode === 'refresh_token'" label="Refresh Token">
          <el-input
            v-model="form.refreshToken"
            type="textarea"
            :rows="4"
            resize="vertical"
            autocomplete="off"
          />
        </el-form-item>
        <el-alert
          v-if="form.authMode === 'refresh_token'"
          title="同步会轮换 refresh token；完成后请保存结果中的新 token。"
          type="warning"
          show-icon
          :closable="false"
          class="form-alert"
        />

        <template v-else>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" type="email" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password autocomplete="current-password" />
          </el-form-item>
          <el-form-item v-if="captchaEnabled" label="人机验证">
            <Sub2ApiCaptcha
              ref="captchaRef"
              :enabled="form.authMode === 'account'"
              :provider="captchaProvider"
              :site-key="captchaSiteKey"
              :api-endpoint="captchaApiEndpoint"
              @verify="form.captchaToken = $event; captchaError = ''"
              @expire="form.captchaToken = ''"
              @error="handleCaptchaError"
            />
            <span v-if="captchaError" class="field-error">{{ captchaError }}</span>
          </el-form-item>
        </template>
      </template>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="form-alert" />
      <el-form-item v-if="recoveryRefreshToken" label="本次登录生成的新 refresh token">
        <el-input :model-value="recoveryRefreshToken" type="password" show-password readonly>
          <template #append>
            <el-button aria-label="复制恢复用 refresh token" @click="copyRefreshToken"><Clipboard :size="16" /></el-button>
          </template>
        </el-input>
      </el-form-item>
    </el-form>

    <template #footer>
      <template v-if="result">
        <el-button @click="resetFlow">再次同步</el-button>
        <el-button type="primary" @click="emit('close')">完成</el-button>
      </template>
      <template v-else>
        <el-button @click="emit('close')">取消</el-button>
        <el-button type="primary" :loading="syncing" :disabled="!canSubmit" @click="submit">
          {{ challenge ? '验证并同步' : '同步全部分组' }}
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-alert {
  margin-bottom: 16px;
}

.field-error {
  display: block;
  margin-top: 6px;
  color: var(--danger);
  font-size: 12px;
}

.sync-result {
  display: grid;
  gap: 18px;
}

.result-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.result-heading > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.result-heading strong,
.result-heading span {
  overflow-wrap: anywhere;
}

.result-heading strong {
  color: var(--text);
  font-size: 16px;
}

.result-heading span {
  color: var(--muted);
  font-size: 12px;
}

.result-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid var(--success);
  border-radius: 8px;
  color: var(--success);
}

.rotated-token {
  margin-bottom: 0;
}
</style>
