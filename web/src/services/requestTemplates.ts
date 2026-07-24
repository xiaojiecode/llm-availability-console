import type { Provider, RequestTemplate } from '../types'

const OPENAI_HEADERS = JSON.stringify({
  accept: 'application/json',
  authorization: 'Bearer {{apiKey}}',
  'content-type': 'application/json',
}, null, 2)

const OPENAI_BODY = JSON.stringify({
  model: '{{model}}',
  messages: [{ role: 'user', content: 'no thinking and reply pong' }],
  max_completion_tokens: 1,
  reasoning_effort: 'none',
  stream: false,
}, null, 2)

const ANTHROPIC_HEADERS = JSON.stringify({
  accept: 'application/json',
  'anthropic-dangerous-direct-browser-access': 'true',
  'anthropic-version': '2023-06-01',
  'content-type': 'application/json',
  'x-api-key': '{{apiKey}}',
}, null, 2)

const ANTHROPIC_BODY = JSON.stringify({
  model: '{{model}}',
  messages: [{ role: 'user', content: 'reply pong' }],
  max_tokens: 1,
  stream: false,
}, null, 2)

export function defaultRequestTemplate(provider: Provider): RequestTemplate {
  if (provider === 'anthropic') {
    return {
      method: 'POST',
      path: '/v1/messages',
      headersJson: ANTHROPIC_HEADERS,
      bodyJson: ANTHROPIC_BODY,
    }
  }
  return {
    method: 'POST',
    path: '/v1/chat/completions',
    headersJson: OPENAI_HEADERS,
    bodyJson: OPENAI_BODY,
  }
}

export function defaultProviderValues(provider: Provider) {
  if (provider === 'anthropic') {
    return {
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-7-sonnet-latest',
      requestTemplate: defaultRequestTemplate(provider),
    }
  }
  return {
    baseUrl: provider === 'openai' ? 'https://api.openai.com' : '',
    model: provider === 'openai' ? 'gpt-5.6-lune' : '',
    requestTemplate: defaultRequestTemplate(provider),
  }
}
