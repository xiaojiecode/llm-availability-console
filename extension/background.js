const REQUEST_TIMEOUT_MS = 15_000
const MAX_BODY_LENGTH = 2 * 1024 * 1024
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const BLOCKED_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'proxy-authorization',
  'referer',
  'transfer-encoding',
])

export function isAllowedPageUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.origin === 'https://xiaojiecode.github.io') {
      return url.pathname.startsWith('/llm-availability-console/')
    }
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

export function sanitizeHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, headerValue]) => {
        const normalized = key.toLowerCase()
        return typeof headerValue === 'string'
          && !BLOCKED_HEADERS.has(normalized)
          && !normalized.startsWith('sec-')
          && !normalized.startsWith('x-forwarded-')
      }),
  )
}

function normalizeRequest(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('请求数据无效')
  const url = new URL(payload.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅允许 HTTP 或 HTTPS 地址')
  const method = String(payload.method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) throw new Error('请求方法不受支持')
  const body = payload.body == null ? undefined : String(payload.body)
  if (body && body.length > MAX_BODY_LENGTH) throw new Error('请求体超过 2 MiB')
  return { url: url.toString(), method, headers: sanitizeHeaders(payload.headers), body }
}

export async function executeExtensionFetch(payload, fetchImpl = fetch) {
  const request = normalizeRequest(payload)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    })
    return {
      ok: true,
      response: {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof DOMException && error.name === 'AbortError'
        ? '扩展请求超过 15 秒'
        : error instanceof Error ? error.message : '扩展请求失败',
    }
  } finally {
    clearTimeout(timeout)
  }
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'LLMPING_EXTENSION_FETCH') return false
    if (!sender.url || !isAllowedPageUrl(sender.url)) {
      sendResponse({ ok: false, error: '请求来源不受信任' })
      return false
    }
    void executeExtensionFetch(message.payload).then(sendResponse)
    return true
  })
}

if (globalThis.chrome?.action?.onClicked) {
  chrome.action.onClicked.addListener(() => {
    void chrome.tabs.create({ url: 'https://xiaojiecode.github.io/llm-availability-console/' })
  })
}
