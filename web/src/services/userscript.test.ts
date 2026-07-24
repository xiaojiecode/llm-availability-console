import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserscriptBridge } from './userscript'

afterEach(() => {
  vi.restoreAllMocks()
})

function userscriptMessage(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', {
    source: window,
    origin: window.location.origin,
    data: { source: 'llmping-userscript', ...data },
  }))
}

describe('userscript bridge', () => {
  it('detects the userscript and relays a fetch response', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const bridge = new UserscriptBridge(window, 50, 100)
    bridge.start()
    userscriptMessage({ type: 'LLMPING_USERSCRIPT_READY' })

    expect(bridge.getStatus()).toBe('connected')
    const responsePromise = bridge.fetch({
      url: 'https://lucen.cc/v1/models',
      method: 'GET',
      headers: { Authorization: 'Bearer test' },
    })
    await Promise.resolve()
    const request = postMessage.mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .find((message) => message.type === 'LLMPING_USERSCRIPT_FETCH')

    userscriptMessage({
      type: 'LLMPING_USERSCRIPT_RESPONSE',
      requestId: request?.requestId,
      payload: { ok: true, response: { ok: true, status: 200, body: '{"data":[]}' } },
    })

    await expect(responsePromise).resolves.toEqual({ ok: true, status: 200, body: '{"data":[]}' })
    bridge.stop()
  })
})
