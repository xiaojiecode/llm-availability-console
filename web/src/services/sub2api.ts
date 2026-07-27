import type { ChannelInput, Provider, RequestTemplate, Sub2ApiChannelSource } from '../types'
import { UserscriptUnavailableError, userscriptBridge, type UserscriptFetchInput, type UserscriptFetchResponse } from './userscript'

export type Sub2ApiAuthMode = 'refresh_token' | 'account'

export interface Sub2ApiPublicSettings {
  site_name?: string
  captcha_enabled?: boolean
  captcha_provider?: string
  captcha_site_key?: string
  captcha_api_endpoint?: string
  turnstile_enabled?: boolean
  turnstile_site_key?: string
  totp_enabled?: boolean
}

export interface Sub2ApiSyncInput {
  site: string
  authMode: Sub2ApiAuthMode
  refreshToken?: string
  email?: string
  password?: string
  captchaToken?: string
  tempToken?: string
  totpCode?: string
}

export interface Sub2ApiTwoFactorChallenge {
  requiresTwoFactor: true
  tempToken: string
  maskedEmail: string
}

export interface Sub2ApiSyncResult {
  requiresTwoFactor: false
  origin: string
  siteName: string
  groupCount: number
  createdKeyCount: number
  reusedKeyCount: number
  createdChannelCount: number
  updatedChannelCount: number
  disabledChannelCount: number
  rotatedRefreshToken: string
}

interface Sub2ApiTransport {
  fetch(input: UserscriptFetchInput): Promise<UserscriptFetchResponse>
}

interface ApiEnvelope<T> {
  code: number | string
  message?: string
  reason?: string
  data?: T
}

interface AuthSession {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user?: { email?: string }
}

interface LoginTwoFactorResponse {
  requires_2fa: true
  temp_token: string
  user_email_masked?: string
}

interface Sub2ApiGroup {
  id: number
  name: string
  description?: string | null
  platform: string
  rate_multiplier: number
  status: string
}

interface Sub2ApiKey {
  id: number
  key: string
  name: string
  group_id: number | null
  status: string
}

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface RemoteSyncResult {
  origin: string
  siteName: string
  groupCount: number
  createdKeyCount: number
  reusedKeyCount: number
  rotatedRefreshToken: string
  channels: ChannelInput[]
}

export class Sub2ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly reason = '') {
    super(message)
    this.name = 'Sub2ApiRequestError'
  }
}

export class Sub2ApiSyncError extends Error {
  constructor(message: string, readonly rotatedRefreshToken: string, readonly originalError: unknown) {
    super(message)
    this.name = 'Sub2ApiSyncError'
  }
}

function idempotencyKey() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `sub2api-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function parseResponseBody(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function responseMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.trim()) return record.message
  const nested = record.error
  if (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).message === 'string') {
    return String((nested as Record<string, unknown>).message)
  }
  return fallback
}

async function requestJson<T>(
  origin: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
  transport: Sub2ApiTransport = userscriptBridge,
): Promise<T> {
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`
  const request: UserscriptFetchInput = {
    url,
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }
  let response: UserscriptFetchResponse
  try {
    response = await transport.fetch(request)
  } catch (error) {
    if (!(error instanceof UserscriptUnavailableError)) throw error
    try {
      const direct = await fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })
      response = { ok: direct.ok, status: direct.status, body: await direct.text() }
    } catch {
      throw new Error('油猴跨域请求桥未连接，且目标站点不允许浏览器直连')
    }
  }

  const payload = parseResponseBody(response.body)
  const envelope = payload && typeof payload === 'object' && 'code' in payload
    ? payload as ApiEnvelope<T>
    : undefined
  if (!response.ok || (envelope && Number(envelope.code) !== 0)) {
    const fallback = response.body.trim().slice(0, 300) || `HTTP ${response.status}`
    throw new Sub2ApiRequestError(
      responseMessage(payload, fallback),
      response.status,
      envelope?.reason ?? '',
    )
  }
  return (envelope ? envelope.data : payload) as T
}

export function normalizeSub2ApiOrigin(value: string) {
  const raw = value.trim()
  if (!raw) throw new Error('请输入中转站地址')
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('中转站地址必须使用 HTTP(S)')
  return url.origin
}

export async function getSub2ApiPublicSettings(site: string, transport?: Sub2ApiTransport) {
  const origin = normalizeSub2ApiOrigin(site)
  const settings = await requestJson<Sub2ApiPublicSettings>(origin, '/api/v1/settings/public', {}, transport)
  return { origin, settings }
}

async function authenticate(
  input: Sub2ApiSyncInput,
  origin: string,
  transport?: Sub2ApiTransport,
): Promise<AuthSession | Sub2ApiTwoFactorChallenge> {
  if (input.tempToken) {
    const totpCode = input.totpCode?.trim() ?? ''
    if (!/^\d{6}$/.test(totpCode)) throw new Error('请输入 6 位动态验证码')
    return requestJson<AuthSession>(origin, '/api/v1/auth/login/2fa', {
      method: 'POST',
      body: { temp_token: input.tempToken, totp_code: totpCode },
    }, transport)
  }

  if (input.authMode === 'refresh_token') {
    const refreshToken = input.refreshToken?.trim() ?? ''
    if (!refreshToken) throw new Error('请输入 refresh token')
    return requestJson<AuthSession>(origin, '/api/v1/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    }, transport)
  }

  const email = input.email?.trim() ?? ''
  const password = input.password ?? ''
  if (!email || !password) throw new Error('请输入邮箱和密码')
  const login = await requestJson<AuthSession | LoginTwoFactorResponse>(origin, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      ...(input.captchaToken ? { turnstile_token: input.captchaToken } : {}),
    },
  }, transport)
  if ('requires_2fa' in login && login.requires_2fa) {
    return {
      requiresTwoFactor: true,
      tempToken: login.temp_token,
      maskedEmail: login.user_email_masked ?? '',
    }
  }
  return login as AuthSession
}

function authHeaders(accessToken: string, extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${accessToken}`, ...extra }
}

async function listAllKeys(origin: string, accessToken: string, transport?: Sub2ApiTransport) {
  const all: Sub2ApiKey[] = []
  let page = 1
  do {
    const result = await requestJson<PaginatedResponse<Sub2ApiKey>>(
      origin,
      `/api/v1/keys?page=${page}&page_size=500`,
      { headers: authHeaders(accessToken) },
      transport,
    )
    all.push(...result.items)
    if (page >= Math.max(1, result.pages)) break
    page += 1
  } while (page <= 100)
  return all
}

function usableKey(value: string) {
  const key = value.trim()
  return key.length >= 8 && !key.includes('***') && !key.includes('...')
}

async function resolveKeyValue(origin: string, accessToken: string, key: Sub2ApiKey, transport?: Sub2ApiTransport) {
  if (usableKey(key.key)) return key
  return requestJson<Sub2ApiKey>(origin, `/api/v1/keys/${key.id}`, {
    headers: authHeaders(accessToken),
  }, transport)
}

function createRequestTemplate(): RequestTemplate {
  return {
    method: 'GET',
    path: '/v1/models',
    headersJson: JSON.stringify({
      accept: 'application/json',
      authorization: 'Bearer {{apiKey}}',
    }, null, 2),
    bodyJson: '{}',
  }
}

function providerForPlatform(platform: string): Provider {
  return platform === 'anthropic' ? 'anthropic' : 'openai'
}

function fallbackModel(platform: string) {
  if (platform === 'anthropic') return 'claude-models'
  if (platform === 'gemini' || platform === 'antigravity') return 'gemini-models'
  if (platform === 'grok') return 'grok-models'
  return 'openai-models'
}

function modelIds(payload: unknown) {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const items = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : []
  return items.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (!item || typeof item !== 'object') return []
    const id = (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).name
    return typeof id === 'string' && id.trim() ? [id.replace(/^models\//, '')] : []
  })
}

async function discoverModel(origin: string, apiKey: string, platform: string, transport?: Sub2ApiTransport) {
  try {
    const payload = await requestJson<unknown>(origin, '/v1/models', {
      headers: { authorization: `Bearer ${apiKey}` },
    }, transport)
    return modelIds(payload)[0] ?? fallbackModel(platform)
  } catch {
    return fallbackModel(platform)
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function syncRemoteGroups(
  origin: string,
  siteName: string,
  accessToken: string,
  rotatedRefreshToken: string,
  transport?: Sub2ApiTransport,
): Promise<RemoteSyncResult> {
  const [groups, rates, existingKeys] = await Promise.all([
    requestJson<Sub2ApiGroup[]>(origin, '/api/v1/groups/available', { headers: authHeaders(accessToken) }, transport),
    requestJson<Record<string, number> | null>(origin, '/api/v1/groups/rates', { headers: authHeaders(accessToken) }, transport)
      .catch(() => null),
    listAllKeys(origin, accessToken, transport),
  ])
  const activeGroups = groups.filter((group) => group.status !== 'inactive')
  const keysByGroup = new Map<number, Sub2ApiKey>()
  for (const key of existingKeys) {
    if (key.group_id && key.status === 'active' && !keysByGroup.has(key.group_id)) keysByGroup.set(key.group_id, key)
  }

  let createdKeyCount = 0
  let reusedKeyCount = 0
  const groupKeys = await mapWithConcurrency(activeGroups, 3, async (group) => {
    const current = keysByGroup.get(group.id)
    if (current) {
      reusedKeyCount += 1
      return { group, key: await resolveKeyValue(origin, accessToken, current, transport) }
    }
    const key = await requestJson<Sub2ApiKey>(origin, '/api/v1/keys', {
      method: 'POST',
      headers: authHeaders(accessToken, { 'idempotency-key': idempotencyKey() }),
      body: { name: `LLM 观测台 · ${group.name}`, group_id: group.id },
    }, transport)
    createdKeyCount += 1
    return { group, key }
  })

  const channels = await mapWithConcurrency(groupKeys, 4, async ({ group, key }) => {
    const source: Sub2ApiChannelSource = {
      type: 'sub2api',
      origin,
      groupId: group.id,
      groupPlatform: group.platform,
      remoteKeyId: key.id,
    }
    const rate = rates?.[String(group.id)] ?? group.rate_multiplier ?? 1
    return {
      name: `${new URL(origin).hostname} · ${group.name}`,
      provider: providerForPlatform(group.platform),
      baseUrl: origin,
      apiKey: key.key,
      model: await discoverModel(origin, key.key, group.platform, transport),
      enabled: true,
      note: `sub2api 分组 #${group.id} · ${group.platform}`,
      rateMultiplier: rate > 0 ? rate : 1,
      proxyUrl: '',
      requestTemplate: createRequestTemplate(),
      source,
    } satisfies ChannelInput
  })

  return {
    origin,
    siteName,
    groupCount: activeGroups.length,
    createdKeyCount,
    reusedKeyCount,
    rotatedRefreshToken,
    channels,
  }
}

export async function syncSub2ApiRemote(
  input: Sub2ApiSyncInput,
  transport?: Sub2ApiTransport,
): Promise<RemoteSyncResult | Sub2ApiTwoFactorChallenge> {
  const { origin, settings } = await getSub2ApiPublicSettings(input.site, transport)
  const auth = await authenticate(input, origin, transport)
  if ('requiresTwoFactor' in auth) return auth
  if (!auth.access_token) throw new Error('登录响应缺少 access token')
  const rotatedRefreshToken = auth.refresh_token?.trim() ?? ''
  try {
    return await syncRemoteGroups(
      origin,
      settings.site_name?.trim() || new URL(origin).hostname,
      auth.access_token,
      rotatedRefreshToken,
      transport,
    )
  } catch (error) {
    throw new Sub2ApiSyncError(
      error instanceof Error ? error.message : '中转站同步失败',
      rotatedRefreshToken,
      error,
    )
  }
}
