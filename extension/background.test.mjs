import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { executeExtensionFetch, isAllowedPageUrl, sanitizeHeaders } from './background.js'

test('manifest 使用 MV3 并覆盖线上观测台', async () => {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.manifest_version, 3)
  assert.ok(manifest.content_scripts[0].matches.includes('https://xiaojiecode.github.io/llm-availability-console/*'))
})

test('只接受观测台页面来源', () => {
  assert.equal(isAllowedPageUrl('https://xiaojiecode.github.io/llm-availability-console/'), true)
  assert.equal(isAllowedPageUrl('http://localhost:5173/'), true)
  assert.equal(isAllowedPageUrl('https://example.com/llm-availability-console/'), false)
})

test('保留 Authorization 并过滤浏览器身份头', async () => {
  const headers = sanitizeHeaders({ Authorization: 'Bearer test', Cookie: 'private', Origin: 'https://bad.example' })
  assert.deepEqual(headers, { Authorization: 'Bearer test' })

  let captured
  const result = await executeExtensionFetch({
    url: 'https://lucen.cc/v1/chat/completions',
    method: 'POST',
    headers: { Authorization: 'Bearer test', Cookie: 'private' },
    body: '{"model":"test"}',
  }, async (url, init) => {
    captured = { url, init }
    return new Response('{"ok":true}', { status: 200 })
  })

  assert.equal(result.ok, true)
  assert.equal(captured.url, 'https://lucen.cc/v1/chat/completions')
  assert.equal(captured.init.headers.Authorization, 'Bearer test')
  assert.equal(captured.init.headers.Cookie, undefined)
})
