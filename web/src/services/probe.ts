import type { ChannelInput, Probe, RequestTemplate } from '../types'

interface TemplateContext {
  apiKey: string
  baseUrl: string
  model: string
  timestamp: string
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const RESPONSE_LIMIT = 2_048
const REQUEST_TIMEOUT_MS = 15_000

export function parseJsonObject(raw: string, label: string): Record<string, JsonValue> {
  let value: unknown
  try {
    value = JSON.parse(raw || '{}')
  } catch (error) {
    throw new Error(`${label}不是有效 JSON：${error instanceof Error ? error.message : '解析失败'}`)
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label}必须是 JSON 对象`)
  }
  return value as Record<string, JsonValue>
}

function replaceTemplateString(value: string, context: TemplateContext) {
  return value.replace(/\{\{(apiKey|baseUrl|model|timestamp)\}\}/g, (_, key: keyof TemplateContext) => context[key])
}

function replaceTemplateValue(value: JsonValue, context: TemplateContext): JsonValue {
  if (typeof value === 'string') return replaceTemplateString(value, context)
  if (Array.isArray(value)) return value.map((item) => replaceTemplateValue(item, context))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [replaceTemplateString(key, context), replaceTemplateValue(item, context)]),
    )
  }
  return value
}

function joinUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export function resolveRequestUrl(channel: Pick<ChannelInput, 'baseUrl' | 'proxyUrl'>, path: string) {
  const targetUrl = joinUrl(channel.baseUrl, path)
  if (!channel.proxyUrl.trim()) return targetUrl
  if (!channel.proxyUrl.includes('{{url}}')) {
    throw new Error('代理 URL 必须包含 {{url}} 占位符')
  }
  return channel.proxyUrl.split('{{url}}').join(encodeURIComponent(targetUrl))
}

export function normalizeProxyUrl(value: string) {
  const normalized = value.trim()
  if (normalized && !normalized.includes('{{url}}')) {
    throw new Error('代理 URL 必须包含 {{url}} 占位符')
  }
  return normalized
}

export function validateRequestTemplate(template: RequestTemplate) {
  if (!template.path.trim()) throw new Error('请求路径不能为空')
  parseJsonObject(template.headersJson, 'Headers')
  if (template.method !== 'GET' && template.method !== 'DELETE') {
    parseJsonObject(template.bodyJson, 'Body')
  }
}

export function buildProbeRequest(channel: ChannelInput) {
  validateRequestTemplate(channel.requestTemplate)
  const context: TemplateContext = {
    apiKey: channel.apiKey,
    baseUrl: channel.baseUrl.replace(/\/$/, ''),
    model: channel.model,
    timestamp: new Date().toISOString(),
  }
  const rawHeaders = parseJsonObject(channel.requestTemplate.headersJson, 'Headers')
  const headersValue = replaceTemplateValue(rawHeaders, context) as Record<string, JsonValue>
  const headers = Object.fromEntries(
    Object.entries(headersValue).map(([key, value]) => [key, String(value)]),
  )
  const canHaveBody = !['GET', 'DELETE'].includes(channel.requestTemplate.method)
  const bodyValue = canHaveBody
    ? replaceTemplateValue(parseJsonObject(channel.requestTemplate.bodyJson, 'Body'), context)
    : undefined
  const path = replaceTemplateString(channel.requestTemplate.path, context)
  return {
    url: resolveRequestUrl(channel, path),
    targetUrl: joinUrl(channel.baseUrl, path),
    init: {
      method: channel.requestTemplate.method,
      headers,
      body: bodyValue === undefined ? undefined : JSON.stringify(bodyValue),
    } satisfies RequestInit,
    requestBody: bodyValue === undefined ? '' : JSON.stringify(bodyValue, null, 2),
  }
}

function numberAt(value: unknown, ...path: string[]) {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object') return 0
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'number' ? current : 0
}

function usageFromResponse(payload: unknown) {
  const promptTokens = numberAt(payload, 'usage', 'prompt_tokens') || numberAt(payload, 'usage', 'input_tokens')
  const completionTokens = numberAt(payload, 'usage', 'completion_tokens') || numberAt(payload, 'usage', 'output_tokens')
  const totalTokens = numberAt(payload, 'usage', 'total_tokens') || promptTokens + completionTokens
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens: numberAt(payload, 'usage', 'prompt_tokens_details', 'cached_tokens')
      || numberAt(payload, 'usage', 'cache_read_input_tokens'),
    reasoningTokens: numberAt(payload, 'usage', 'completion_tokens_details', 'reasoning_tokens'),
  }
}

function responseError(status: number, raw: string) {
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>
    const nested = payload.error
    if (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).message === 'string') {
      return String((nested as Record<string, unknown>).message)
    }
    if (typeof payload.message === 'string') return payload.message
  } catch {
    // Use the response excerpt below.
  }
  return raw.trim() || `HTTP ${status}`
}

export async function performProbe(channel: ChannelInput & { id: number }): Promise<Omit<Probe, 'id'>> {
  const request = buildProbeRequest(channel)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const startedAt = performance.now()
  const checkedAt = new Date().toISOString()
  try {
    const response = await fetch(request.url, { ...request.init, signal: controller.signal })
    const raw = (await response.text()).slice(0, RESPONSE_LIMIT)
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = undefined
    }
    const usage = usageFromResponse(payload)
    return {
      channelId: channel.id,
      success: response.ok,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      error: response.ok ? '' : responseError(response.status, raw),
      warning: '',
      requestBody: request.requestBody,
      responseExcerpt: raw,
      ...usage,
      billingCurrency: '',
      checkedAt,
    }
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    const message = aborted
      ? `请求超过 ${REQUEST_TIMEOUT_MS / 1_000} 秒`
      : channel.proxyUrl
        ? `代理请求失败：${error instanceof Error ? error.message : '网络错误'}`
        : '浏览器无法访问目标地址，可能被 CORS 或网络策略拦截；请为该信道配置代理 URL'
    return {
      channelId: channel.id,
      success: false,
      statusCode: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      error: message,
      warning: '',
      requestBody: request.requestBody,
      responseExcerpt: '',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      billingCurrency: '',
      checkedAt,
    }
  } finally {
    window.clearTimeout(timeout)
  }
}
