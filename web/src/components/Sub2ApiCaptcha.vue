<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { createUserscriptFetch } from '../services/userscript'

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string
  reset(widgetId: string): void
  remove(widgetId: string): void
}

interface TencentCaptchaInstance {
  show(): void
  destroy?(): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    onSub2ApiTurnstileLoad?: () => void
    TencentCaptcha?: new (
      appId: string,
      callback: (result: { ticket?: string; randstr?: string; errorCode?: number; errorMessage?: string }) => void,
      options?: Record<string, unknown>,
    ) => TencentCaptchaInstance
  }
}

const props = withDefaults(defineProps<{
  enabled: boolean
  provider?: string
  siteKey?: string
  apiEndpoint?: string
}>(), {
  provider: 'turnstile',
  siteKey: '',
  apiEndpoint: '',
})

const emit = defineEmits<{
  verify: [token: string]
  expire: []
  error: [message: string]
}>()

const container = shallowRef<HTMLElement>()
let capWidget: (HTMLElement & { reset?: () => void }) | undefined
let turnstileId = ''
let tencent: TencentCaptchaInstance | undefined
let capFetch: typeof fetch | undefined

function providerName() {
  return props.provider.trim().toLowerCase() || 'turnstile'
}

async function loadScript(src: string, ready: () => boolean, callbackName?: string) {
  if (ready()) return
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('验证码脚本加载失败')), { once: true })
    })
    return
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    if (callbackName) {
      ;(window as unknown as Record<string, unknown>)[callbackName] = () => resolve()
    } else {
      script.addEventListener('load', () => resolve(), { once: true })
    }
    script.addEventListener('error', () => reject(new Error('验证码脚本加载失败')), { once: true })
    document.head.appendChild(script)
  })
}

function cleanup() {
  capWidget?.remove()
  capWidget = undefined
  if (turnstileId && window.turnstile) {
    try { window.turnstile.remove(turnstileId) } catch { /* Widget may already be gone. */ }
  }
  turnstileId = ''
  tencent?.destroy?.()
  tencent = undefined
  if (capFetch && window.CAP_CUSTOM_FETCH === capFetch) window.CAP_CUSTOM_FETCH = undefined
  capFetch = undefined
  container.value?.replaceChildren()
}

async function renderCap() {
  if (!container.value || !props.apiEndpoint) throw new Error('CAP 验证地址缺失')
  capFetch = createUserscriptFetch()
  window.CAP_CUSTOM_FETCH = capFetch
  await import('@cap.js/widget')
  capWidget = document.createElement('cap-widget')
  capWidget.setAttribute('data-cap-api-endpoint', props.apiEndpoint)
  capWidget.setAttribute('data-cap-disable-haptics', '')
  capWidget.setAttribute('data-cap-i18n-initial-state', '点击完成验证')
  capWidget.setAttribute('data-cap-i18n-verifying-label', '验证中')
  capWidget.setAttribute('data-cap-i18n-solved-label', '验证完成')
  capWidget.addEventListener('solve', ((event: CustomEvent<{ token: string }>) => emit('verify', event.detail.token)) as EventListener)
  capWidget.addEventListener('error', (() => emit('error', 'CAP 验证失败')) as EventListener)
  container.value.replaceChildren(capWidget)
}

async function renderTurnstile() {
  if (!container.value || !props.siteKey) throw new Error('Turnstile Site Key 缺失')
  await loadScript(
    'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onSub2ApiTurnstileLoad',
    () => Boolean(window.turnstile),
    'onSub2ApiTurnstileLoad',
  )
  if (!window.turnstile) throw new Error('Turnstile 初始化失败')
  turnstileId = window.turnstile.render(container.value, {
    sitekey: props.siteKey,
    callback: (token: string) => emit('verify', token),
    'expired-callback': () => emit('expire'),
    'error-callback': () => emit('error', 'Turnstile 验证失败'),
    theme: 'auto',
    size: 'flexible',
  })
}

async function showTencent() {
  if (!props.siteKey) throw new Error('腾讯验证码 App ID 缺失')
  await loadScript('https://turing.captcha.qcloud.com/TJCaptcha.js', () => Boolean(window.TencentCaptcha))
  if (!window.TencentCaptcha) throw new Error('腾讯验证码初始化失败')
  tencent?.destroy?.()
  tencent = new window.TencentCaptcha(props.siteKey, (result) => {
    if (!result.ticket) {
      emit('error', '腾讯验证码未完成')
      return
    }
    emit('verify', JSON.stringify({
      provider: 'tencent',
      ticket: result.ticket,
      randstr: result.randstr ?? '',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    }))
  })
  tencent.show()
}

async function render() {
  cleanup()
  if (!props.enabled) return
  await nextTick()
  try {
    const provider = providerName()
    if (provider === 'cap') await renderCap()
    else if (provider !== 'tencent') await renderTurnstile()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '验证码初始化失败')
  }
}

function reset() {
  if (providerName() === 'cap') capWidget?.reset?.()
  else if (turnstileId && window.turnstile) window.turnstile.reset(turnstileId)
  else tencent?.destroy?.()
}

defineExpose({ reset })

onMounted(render)
onBeforeUnmount(cleanup)
watch(() => [props.enabled, props.provider, props.siteKey, props.apiEndpoint], render)
</script>

<template>
  <div v-if="enabled" class="captcha-shell">
    <el-button v-if="providerName() === 'tencent'" class="captcha-button" @click="showTencent">
      完成人机验证
    </el-button>
    <div ref="container" class="captcha-container" />
  </div>
</template>

<style scoped>
.captcha-shell,
.captcha-container {
  width: 100%;
  min-width: 0;
}

.captcha-button {
  width: 100%;
}

.captcha-container :deep(iframe),
.captcha-container :deep(cap-widget) {
  width: 100%;
  max-width: 100%;
}
</style>
