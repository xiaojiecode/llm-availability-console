const PAGE_SOURCE = 'llmping-page'
const EXTENSION_SOURCE = 'llmping-extension'

function postToPage(message) {
  window.postMessage({ source: EXTENSION_SOURCE, ...message }, window.location.origin)
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const message = event.data
  if (!message || message.source !== PAGE_SOURCE) return

  if (message.type === 'LLMPING_EXTENSION_PING') {
    postToPage({ type: 'LLMPING_EXTENSION_READY' })
    return
  }

  if (message.type !== 'LLMPING_EXTENSION_FETCH' || typeof message.requestId !== 'string') return

  chrome.runtime.sendMessage(
    { type: 'LLMPING_EXTENSION_FETCH', payload: message.payload },
    (response) => {
      const runtimeError = chrome.runtime.lastError
      postToPage({
        type: 'LLMPING_EXTENSION_RESPONSE',
        requestId: message.requestId,
        payload: runtimeError
          ? { ok: false, error: runtimeError.message || '扩展后台不可用' }
          : response,
      })
    },
  )
})

postToPage({ type: 'LLMPING_EXTENSION_READY' })
