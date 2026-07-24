import { describe, expect, it, vi } from 'vitest'
import type { ChannelInput } from '../types'
import { defaultProviderValues } from './requestTemplates'
import { buildProbeRequest, normalizeProxyUrl, performProbe, validateRequestTemplate } from './probe'

function channel(overrides: Partial<ChannelInput> = {}): ChannelInput & { id: number } {
  const defaults = defaultProviderValues('openai')
  return {
    id: 1,
    name: 'primary',
    provider: 'openai',
    baseUrl: defaults.baseUrl,
    apiKey: 'sk-test',
    model: defaults.model,
    enabled: true,
    note: '',
    rateMultiplier: 1,
    proxyUrl: '',
    requestTemplate: defaults.requestTemplate,
    ...overrides,
  }
}

describe('request templates', () => {
  it('validates unified proxy URL templates', () => {
    expect(normalizeProxyUrl(' https://proxy.example/?url={{url}} ')).toBe('https://proxy.example/?url={{url}}')
    expect(() => normalizeProxyUrl('https://proxy.example/')).toThrow('必须包含 {{url}}')
  })
  it('replaces variables in OpenAI headers and body', () => {
    const request = buildProbeRequest(channel())

    expect(request.targetUrl).toBe('https://api.openai.com/v1/chat/completions')
    expect((request.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
    expect(JSON.parse(request.init.body as string).model).toBe('gpt-5.6-lune')
  })

  it('uses an encoded target URL with a configured CORS proxy', () => {
    const request = buildProbeRequest(channel({
      proxyUrl: 'https://proxy.example.com/?url={{url}}',
    }))

    expect(request.url).toBe(
      'https://proxy.example.com/?url=https%3A%2F%2Fapi.openai.com%2Fv1%2Fchat%2Fcompletions',
    )
  })

  it('prefers the browser extension and sends it the original target URL', async () => {
    const extensionFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: '{"usage":{"total_tokens":2}}',
    })

    const result = await performProbe(channel({
      proxyUrl: 'https://proxy.example.com/?url={{url}}',
    }), { fetch: extensionFetch })

    expect(extensionFetch).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
    }))
    expect(result.success).toBe(true)
    expect(result.totalTokens).toBe(2)
  })

  it('includes the Anthropic direct-browser header', () => {
    const defaults = defaultProviderValues('anthropic')
    const request = buildProbeRequest(channel({
      provider: 'anthropic',
      baseUrl: defaults.baseUrl,
      model: defaults.model,
      requestTemplate: defaults.requestTemplate,
    }))

    expect((request.init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('rejects invalid JSON templates', () => {
    const template = { ...defaultProviderValues('openai').requestTemplate, headersJson: '{broken' }
    expect(() => validateRequestTemplate(template)).toThrow('Headers不是有效 JSON')
  })
})
