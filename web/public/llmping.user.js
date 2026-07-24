// ==UserScript==
// @name         LLM 信道观测台跨域请求桥
// @namespace    https://github.com/xiaojiecode/llm-availability-console
// @version      0.2.0
// @description  使用油猴扩展为 LLM 信道观测台提供 HTTP/HTTPS 跨域请求能力。
// @author       xiaojiecode
// @match        https://xiaojiecode.github.io/llm-availability-console/*
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @connect      *
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @downloadURL  https://xiaojiecode.github.io/llm-availability-console/llmping.user.js
// @updateURL    https://xiaojiecode.github.io/llm-availability-console/llmping.user.js
// ==/UserScript==

(function () {
  'use strict'

  const PAGE_SOURCE = 'llmping-page'
  const USERSCRIPT_SOURCE = 'llmping-userscript'
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

  function postToPage(message) {
    window.postMessage({ source: USERSCRIPT_SOURCE, ...message }, window.location.origin)
  }

  function sanitizeHeaders(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(([key, headerValue]) => {
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

  function sendError(requestId, error) {
    postToPage({
      type: 'LLMPING_USERSCRIPT_RESPONSE',
      requestId,
      payload: { ok: false, error },
    })
  }

  function executeRequest(requestId, payload) {
    let request
    try {
      request = normalizeRequest(payload)
    } catch (error) {
      sendError(requestId, error instanceof Error ? error.message : '请求数据无效')
      return
    }

    GM_xmlhttpRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      data: request.body,
      anonymous: true,
      timeout: REQUEST_TIMEOUT_MS,
      onload(response) {
        postToPage({
          type: 'LLMPING_USERSCRIPT_RESPONSE',
          requestId,
          payload: {
            ok: true,
            response: {
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              body: response.responseText || '',
            },
          },
        })
      },
      onabort() {
        sendError(requestId, '油猴跨域请求已取消')
      },
      onerror(response) {
        sendError(requestId, response?.error || response?.statusText || '油猴跨域请求失败')
      },
      ontimeout() {
        sendError(requestId, '油猴跨域请求超过 15 秒')
      },
    })
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const message = event.data
    if (!message || message.source !== PAGE_SOURCE) return

    if (message.type === 'LLMPING_USERSCRIPT_PING') {
      postToPage({ type: 'LLMPING_USERSCRIPT_READY' })
      return
    }

    if (message.type !== 'LLMPING_USERSCRIPT_FETCH' || typeof message.requestId !== 'string') return
    executeRequest(message.requestId, message.payload)
  })

  postToPage({ type: 'LLMPING_USERSCRIPT_READY' })
})()
