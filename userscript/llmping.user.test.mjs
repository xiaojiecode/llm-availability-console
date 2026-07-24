import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const sourceUrl = new URL('../web/public/llmping.user.js', import.meta.url)

function createRuntime(requestHandler = () => {}) {
  const listeners = new Map()
  const posted = []
  const window = {
    location: { origin: 'https://xiaojiecode.github.io' },
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    postMessage(message, origin) {
      posted.push({ message, origin })
    },
  }
  const context = vm.createContext({
    window,
    URL,
    Error,
    Set,
    Object,
    Array,
    String,
    GM_xmlhttpRequest: requestHandler,
  })
  return {
    context,
    posted,
    dispatch(data) {
      listeners.get('message')?.({ source: window, origin: window.location.origin, data })
    },
  }
}

test('油猴脚本声明跨域权限并覆盖线上观测台', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /@grant\s+GM_xmlhttpRequest/)
  assert.match(source, /@connect\s+\*/)
  assert.match(source, /@match\s+https:\/\/xiaojiecode\.github\.io\/llm-availability-console\/\*/)
})

test('通过 GM_xmlhttpRequest 转发原始 HTTP 请求', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  let captured
  const runtime = createRuntime((details) => {
    captured = details
    details.onload({ status: 200, responseText: '{"ok":true}' })
  })
  vm.runInContext(source, runtime.context)

  runtime.dispatch({
    source: 'llmping-page',
    type: 'LLMPING_USERSCRIPT_FETCH',
    requestId: 'probe-1',
    payload: {
      url: 'http://api.example.test/v1/models',
      method: 'POST',
      headers: { Authorization: 'Bearer test', Cookie: 'private' },
      body: '{}',
    },
  })

  assert.equal(captured.url, 'http://api.example.test/v1/models')
  assert.equal(captured.headers.Authorization, 'Bearer test')
  assert.equal(captured.headers.Cookie, undefined)
  assert.equal(captured.anonymous, true)
  const responseMessage = runtime.posted.at(-1).message
  assert.equal(responseMessage.source, 'llmping-userscript')
  assert.equal(responseMessage.type, 'LLMPING_USERSCRIPT_RESPONSE')
  assert.equal(responseMessage.requestId, 'probe-1')
  assert.equal(responseMessage.payload.ok, true)
  assert.equal(responseMessage.payload.response.ok, true)
  assert.equal(responseMessage.payload.response.status, 200)
  assert.equal(responseMessage.payload.response.body, '{"ok":true}')
})
