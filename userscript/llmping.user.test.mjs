import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const sourceUrl = new URL('../web/public/llmping.user.js', import.meta.url)

function createRuntime(requestHandler = () => {}, { isolated = false } = {}) {
  const listeners = new Map()
  const posted = []
  const timers = new Map()
  let timerSequence = 0
  const pageWindow = {
    location: { origin: 'https://xiaojiecode.github.io' },
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    postMessage(message, origin) {
      posted.push({ message, origin })
    },
  }
  const sandboxWindow = isolated
    ? { ...pageWindow, location: { ...pageWindow.location } }
    : pageWindow
  const context = vm.createContext({
    window: sandboxWindow,
    ...(isolated ? { unsafeWindow: pageWindow } : {}),
    URL,
    Error,
    Set,
    Object,
    Array,
    String,
    setTimeout(callback) {
      const id = ++timerSequence
      timers.set(id, callback)
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    GM_xmlhttpRequest: requestHandler,
  })
  return {
    context,
    posted,
    dispatch(data) {
      listeners.get('message')?.({ source: pageWindow, origin: pageWindow.location.origin, data })
    },
    runTimers() {
      const callbacks = [...timers.values()]
      timers.clear()
      callbacks.forEach((callback) => callback())
    },
  }
}

test('油猴脚本声明跨域权限并覆盖线上观测台', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /@grant\s+GM_xmlhttpRequest/)
  assert.match(source, /@grant\s+unsafeWindow/)
  assert.match(source, /@sandbox\s+JavaScript/)
  assert.match(source, /@connect\s+\*/)
  assert.match(source, /@match\s+https:\/\/xiaojiecode\.github\.io\/llm-availability-console\/\*/)
})

test('在 Tampermonkey 隔离沙箱中通过页面窗口完成握手', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  const runtime = createRuntime(undefined, { isolated: true })
  vm.runInContext(source, runtime.context)
  const postedBeforePing = runtime.posted.length

  runtime.dispatch({
    source: 'llmping-page',
    type: 'LLMPING_USERSCRIPT_PING',
  })

  assert.equal(runtime.posted.length, postedBeforePing + 1)
  assert.equal(runtime.posted.at(-1).message.type, 'LLMPING_USERSCRIPT_READY')
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

test('匿名 fetch 模式超时后主动中止底层请求', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  let aborted = false
  const runtime = createRuntime((details) => ({
    abort() {
      aborted = true
      details.onabort()
    },
  }))
  vm.runInContext(source, runtime.context)

  runtime.dispatch({
    source: 'llmping-page',
    type: 'LLMPING_USERSCRIPT_FETCH',
    requestId: 'probe-timeout',
    payload: { url: 'https://api.example.test/v1/models', method: 'GET', headers: {} },
  })
  runtime.runTimers()

  assert.equal(aborted, true)
  const responses = runtime.posted.filter(({ message }) => message.requestId === 'probe-timeout')
  assert.equal(responses.length, 1)
  assert.equal(responses[0].message.payload.ok, false)
  assert.equal(responses[0].message.payload.error, '油猴跨域请求超过 15 秒')
})

test('GM_xmlhttpRequest 同步异常会立即回传', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  const runtime = createRuntime(() => {
    throw new Error('permission denied')
  })
  vm.runInContext(source, runtime.context)

  runtime.dispatch({
    source: 'llmping-page',
    type: 'LLMPING_USERSCRIPT_FETCH',
    requestId: 'probe-start-error',
    payload: { url: 'https://api.example.test/v1/models', method: 'GET', headers: {} },
  })

  const response = runtime.posted.find(({ message }) => message.requestId === 'probe-start-error')
  assert.equal(response.message.payload.ok, false)
  assert.equal(response.message.payload.error, '油猴跨域请求启动失败：permission denied')
})
