import { describe, expect, it, vi } from 'vitest'
import { normalizeSub2ApiOrigin, syncSub2ApiRemote } from './sub2api'
import type { UserscriptFetchInput, UserscriptFetchResponse } from './userscript'

function envelope(data: unknown, status = 200): UserscriptFetchResponse {
  return { ok: status >= 200 && status < 300, status, body: JSON.stringify({ code: status === 200 ? 0 : status, data }) }
}

describe('sub2api sync', () => {
  it('normalizes a pasted station page to its origin', () => {
    expect(normalizeSub2ApiOrigin('lucen.plus/dashboard')).toBe('https://lucen.plus')
  })

  it('rotates a refresh token, reuses keys, creates missing group keys, and builds model probes', async () => {
    const requests: UserscriptFetchInput[] = []
    const fetch = vi.fn(async (input: UserscriptFetchInput) => {
      requests.push(input)
      const path = new URL(input.url).pathname
      if (path === '/api/v1/settings/public') return envelope({ site_name: 'Test Relay' })
      if (path === '/api/v1/auth/refresh') return envelope({ access_token: 'access', refresh_token: 'rotated' })
      if (path === '/api/v1/groups/available') return envelope([
        { id: 1, name: 'Claude', platform: 'anthropic', rate_multiplier: 1.2, status: 'active' },
        { id: 2, name: 'Codex', platform: 'openai', rate_multiplier: 1, status: 'active' },
      ])
      if (path === '/api/v1/groups/rates') return envelope({ 2: 0.8 })
      if (path === '/api/v1/keys' && input.method === 'GET') {
        return envelope({
          items: [{ id: 11, key: 'sk-existing', name: 'existing', group_id: 1, status: 'active' }],
          total: 1,
          page: 1,
          page_size: 500,
          pages: 1,
        })
      }
      if (path === '/api/v1/keys' && input.method === 'POST') {
        return envelope({ id: 22, key: 'sk-created', name: 'created', group_id: 2, status: 'active' })
      }
      if (path === '/v1/models') {
        const auth = input.headers.authorization
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            object: 'list',
            data: [{ id: auth.endsWith('existing') ? 'claude-sonnet-4' : 'gpt-5.1-codex' }],
          }),
        }
      }
      throw new Error(`Unexpected request: ${input.method} ${path}`)
    })

    const result = await syncSub2ApiRemote({
      site: 'https://relay.example/keys',
      authMode: 'refresh_token',
      refreshToken: 'old-refresh',
    }, { fetch })

    expect('requiresTwoFactor' in result).toBe(false)
    if ('requiresTwoFactor' in result) return
    expect(result.rotatedRefreshToken).toBe('rotated')
    expect(result.createdKeyCount).toBe(1)
    expect(result.reusedKeyCount).toBe(1)
    expect(result.channels.map((channel) => channel.model)).toEqual(['claude-sonnet-4', 'gpt-5.1-codex'])
    expect(result.channels[1].rateMultiplier).toBe(0.8)
    expect(result.channels.every((channel) => channel.requestTemplate.path === '/v1/models')).toBe(true)
    expect(requests.find((request) => request.method === 'POST' && request.url.endsWith('/api/v1/keys'))?.headers['idempotency-key']).toBeTruthy()
  })

  it('returns a 2FA challenge before creating keys', async () => {
    const fetch = vi.fn(async (input: UserscriptFetchInput) => {
      const path = new URL(input.url).pathname
      if (path === '/api/v1/settings/public') return envelope({ site_name: 'Relay' })
      if (path === '/api/v1/auth/login') {
        return envelope({ requires_2fa: true, temp_token: 'temp', user_email_masked: 'u***@example.com' })
      }
      throw new Error('sync should pause for 2FA')
    })

    const result = await syncSub2ApiRemote({
      site: 'relay.example',
      authMode: 'account',
      email: 'user@example.com',
      password: 'secret',
      captchaToken: 'captcha',
    }, { fetch })

    expect(result).toEqual({ requiresTwoFactor: true, tempToken: 'temp', maskedEmail: 'u***@example.com' })
  })

  it('logs in with an account and forwards the captcha token', async () => {
    const requests: UserscriptFetchInput[] = []
    const fetch = vi.fn(async (input: UserscriptFetchInput) => {
      requests.push(input)
      const path = new URL(input.url).pathname
      if (path === '/api/v1/settings/public') return envelope({ site_name: 'Relay' })
      if (path === '/api/v1/auth/login') {
        return envelope({ access_token: 'account-access', refresh_token: 'account-refresh' })
      }
      if (path === '/api/v1/groups/available') return envelope([])
      if (path === '/api/v1/groups/rates') return envelope(null)
      if (path === '/api/v1/keys') {
        return envelope({ items: [], total: 0, page: 1, page_size: 500, pages: 1 })
      }
      throw new Error(`Unexpected request: ${input.method} ${path}`)
    })

    const result = await syncSub2ApiRemote({
      site: 'relay.example',
      authMode: 'account',
      email: 'user@example.com',
      password: 'test-password',
      captchaToken: 'captcha-token',
    }, { fetch })

    expect('requiresTwoFactor' in result).toBe(false)
    if ('requiresTwoFactor' in result) return
    const login = requests.find((request) => request.url.endsWith('/api/v1/auth/login'))
    expect(JSON.parse(login?.body ?? '{}')).toEqual({
      email: 'user@example.com',
      password: 'test-password',
      turnstile_token: 'captcha-token',
    })
    expect(result.rotatedRefreshToken).toBe('account-refresh')
    expect(result.groupCount).toBe(0)
  })

  it('completes a 2FA login using only the temporary token and TOTP code', async () => {
    const requests: UserscriptFetchInput[] = []
    const fetch = vi.fn(async (input: UserscriptFetchInput) => {
      requests.push(input)
      const path = new URL(input.url).pathname
      if (path === '/api/v1/settings/public') return envelope({ site_name: 'Relay' })
      if (path === '/api/v1/auth/login/2fa') {
        return envelope({ access_token: '2fa-access', refresh_token: '2fa-refresh' })
      }
      if (path === '/api/v1/groups/available') return envelope([])
      if (path === '/api/v1/groups/rates') return envelope(null)
      if (path === '/api/v1/keys') {
        return envelope({ items: [], total: 0, page: 1, page_size: 500, pages: 1 })
      }
      throw new Error(`Unexpected request: ${input.method} ${path}`)
    })

    const result = await syncSub2ApiRemote({
      site: 'relay.example',
      authMode: 'account',
      tempToken: 'temporary-login-token',
      totpCode: '123456',
    }, { fetch })

    expect('requiresTwoFactor' in result).toBe(false)
    if ('requiresTwoFactor' in result) return
    const verify = requests.find((request) => request.url.endsWith('/api/v1/auth/login/2fa'))
    expect(JSON.parse(verify?.body ?? '{}')).toEqual({
      temp_token: 'temporary-login-token',
      totp_code: '123456',
    })
    expect(requests.some((request) => request.url.endsWith('/api/v1/auth/login'))).toBe(false)
    expect(result.rotatedRefreshToken).toBe('2fa-refresh')
  })

  it('falls back to group rates and resolves a masked existing key from its detail endpoint', async () => {
    const requests: UserscriptFetchInput[] = []
    const fetch = vi.fn(async (input: UserscriptFetchInput) => {
      requests.push(input)
      const path = new URL(input.url).pathname
      if (path === '/api/v1/settings/public') return envelope({ site_name: 'Legacy Relay' })
      if (path === '/api/v1/auth/refresh') return envelope({ access_token: 'access' })
      if (path === '/api/v1/groups/available') {
        return envelope([{ id: 7, name: 'Legacy', platform: 'gemini', rate_multiplier: 1.6, status: 'active' }])
      }
      if (path === '/api/v1/groups/rates') {
        return { ok: false, status: 404, body: JSON.stringify({ code: 404, message: 'not found' }) }
      }
      if (path === '/api/v1/keys') {
        return envelope({
          items: [{ id: 70, key: 'sk-12...89', name: 'masked', group_id: 7, status: 'active' }],
          total: 1,
          page: 1,
          page_size: 500,
          pages: 1,
        })
      }
      if (path === '/api/v1/keys/70') {
        return envelope({ id: 70, key: 'sk-full-existing-key', name: 'masked', group_id: 7, status: 'active' })
      }
      if (path === '/v1/models') return { ok: false, status: 404, body: 'not found' }
      throw new Error(`Unexpected request: ${input.method} ${path}`)
    })

    const result = await syncSub2ApiRemote({
      site: 'relay.example',
      authMode: 'refresh_token',
      refreshToken: 'refresh',
    }, { fetch })

    expect('requiresTwoFactor' in result).toBe(false)
    if ('requiresTwoFactor' in result) return
    expect(result.reusedKeyCount).toBe(1)
    expect(result.createdKeyCount).toBe(0)
    expect(result.channels[0]).toMatchObject({
      apiKey: 'sk-full-existing-key',
      model: 'gemini-models',
      rateMultiplier: 1.6,
    })
    expect(requests.some((request) => request.url.endsWith('/api/v1/keys/70'))).toBe(true)
  })

  it('preserves a rotated refresh token when downstream sync fails', async () => {
    const fetch = vi.fn(async (input: UserscriptFetchInput) => {
      const path = new URL(input.url).pathname
      if (path === '/api/v1/settings/public') return envelope({ site_name: 'Relay' })
      if (path === '/api/v1/auth/refresh') return envelope({ access_token: 'access', refresh_token: 'recover-me' })
      throw new Error('network failed after refresh')
    })

    await expect(syncSub2ApiRemote({
      site: 'relay.example',
      authMode: 'refresh_token',
      refreshToken: 'old',
    }, { fetch })).rejects.toMatchObject({
      name: 'Sub2ApiSyncError',
      rotatedRefreshToken: 'recover-me',
    })
  })
})
