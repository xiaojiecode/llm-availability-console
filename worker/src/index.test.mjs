import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from './index.mjs'

const env = {
  ALLOWED_ORIGINS: 'https://xiaojiecode.github.io',
  ALLOWED_HOSTS: 'lucen.cc',
  PROXY_TOKEN: 'local-test-token',
}

function proxyUrl(target = 'https://lucen.cc/v1/chat/completions') {
  return `https://proxy.example/?token=local-test-token&url=${encodeURIComponent(target)}`
}

test('answers a valid browser preflight', async () => {
  const handle = createHandler(async () => new Response())
  const result = await handle(new Request(proxyUrl(), {
    method: 'OPTIONS',
    headers: { origin: 'https://xiaojiecode.github.io' },
  }), env)

  assert.equal(result.status, 204)
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://xiaojiecode.github.io')
})

test('rejects targets outside the allowlist', async () => {
  const handle = createHandler(async () => new Response())
  const result = await handle(new Request(proxyUrl('https://example.com/private'), {
    headers: { origin: 'https://xiaojiecode.github.io' },
  }), env)

  assert.equal(result.status, 403)
})

test('forwards authorization without proxy credentials or browser origin', async () => {
  let forwarded
  const handle = createHandler(async (request) => {
    forwarded = request
    return Response.json({ ok: true }, { status: 200 })
  })
  const result = await handle(new Request(proxyUrl(), {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
      origin: 'https://xiaojiecode.github.io',
    },
    body: '{"model":"test"}',
  }), env)

  assert.equal(result.status, 200)
  assert.equal(forwarded.url, 'https://lucen.cc/v1/chat/completions')
  assert.equal(forwarded.headers.get('authorization'), 'Bearer test-key')
  assert.equal(forwarded.headers.get('origin'), null)
  assert.equal(await forwarded.text(), '{"model":"test"}')
})
