export type UserscriptStatus = 'checking' | 'connected' | 'unavailable'

export interface UserscriptFetchInput {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface UserscriptFetchResponse {
  ok: boolean
  status: number
  body: string
}

interface BridgeResponse {
  ok: boolean
  response?: UserscriptFetchResponse
  error?: string
}

interface PendingRequest {
  resolve: (response: UserscriptFetchResponse) => void
  reject: (error: Error) => void
  timeout: number
}

const PAGE_SOURCE = 'llmping-page'
const USERSCRIPT_SOURCE = 'llmping-userscript'

export class UserscriptUnavailableError extends Error {
  constructor() {
    super('油猴扩展未连接')
    this.name = 'UserscriptUnavailableError'
  }
}

export class UserscriptBridge {
  private status: UserscriptStatus = 'checking'
  private started = false
  private sequence = 0
  private checkTimeout?: number
  private connectionPromise?: Promise<boolean>
  private readonly listeners = new Set<(status: UserscriptStatus) => void>()
  private readonly pending = new Map<string, PendingRequest>()

  constructor(
    private readonly targetWindow: Window,
    private readonly handshakeTimeoutMs = 700,
    private readonly requestTimeoutMs = 17_000,
  ) {}

  private setStatus(status: UserscriptStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of this.listeners) listener(status)
  }

  private readonly handleMessage = (event: MessageEvent) => {
    if (event.source !== this.targetWindow || event.origin !== this.targetWindow.location.origin) return
    const message = event.data as { source?: string; type?: string; requestId?: string; payload?: BridgeResponse }
    if (message?.source !== USERSCRIPT_SOURCE) return

    if (message.type === 'LLMPING_USERSCRIPT_READY') {
      if (this.checkTimeout) this.targetWindow.clearTimeout(this.checkTimeout)
      this.setStatus('connected')
      return
    }

    if (message.type !== 'LLMPING_USERSCRIPT_RESPONSE' || !message.requestId) return
    const request = this.pending.get(message.requestId)
    if (!request) return
    this.pending.delete(message.requestId)
    this.targetWindow.clearTimeout(request.timeout)
    const payload = message.payload
    if (payload?.ok && payload.response) request.resolve(payload.response)
    else request.reject(new Error(payload?.error || '油猴跨域请求失败'))
  }

  start() {
    if (!this.started) {
      this.started = true
      this.targetWindow.addEventListener('message', this.handleMessage)
    }
    this.recheck()
  }

  stop() {
    if (!this.started) return
    this.started = false
    this.targetWindow.removeEventListener('message', this.handleMessage)
    if (this.checkTimeout) this.targetWindow.clearTimeout(this.checkTimeout)
    for (const request of this.pending.values()) {
      this.targetWindow.clearTimeout(request.timeout)
      request.reject(new Error('油猴连接已关闭'))
    }
    this.pending.clear()
  }

  recheck() {
    this.setStatus('checking')
    this.targetWindow.postMessage({ source: PAGE_SOURCE, type: 'LLMPING_USERSCRIPT_PING' }, this.targetWindow.location.origin)
    if (this.checkTimeout) this.targetWindow.clearTimeout(this.checkTimeout)
    this.checkTimeout = this.targetWindow.setTimeout(() => this.setStatus('unavailable'), this.handshakeTimeoutMs)
  }

  getStatus() {
    return this.status
  }

  subscribe(listener: (status: UserscriptStatus) => void) {
    this.listeners.add(listener)
    listener(this.status)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private waitForConnection() {
    if (this.status === 'connected') return Promise.resolve(true)
    if (this.connectionPromise) return this.connectionPromise
    this.recheck()
    this.connectionPromise = new Promise<boolean>((resolve) => {
      let stop: () => void = () => {}
      stop = this.subscribe((status) => {
        if (status === 'connected') {
          stop()
          resolve(true)
        } else if (status === 'unavailable') {
          stop()
          resolve(false)
        }
      })
    }).finally(() => {
      this.connectionPromise = undefined
    })
    return this.connectionPromise
  }

  async fetch(input: UserscriptFetchInput): Promise<UserscriptFetchResponse> {
    if (!this.started) this.start()
    if (!await this.waitForConnection()) throw new UserscriptUnavailableError()

    const requestId = `probe-${Date.now()}-${++this.sequence}`
    return new Promise<UserscriptFetchResponse>((resolve, reject) => {
      const timeout = this.targetWindow.setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('等待油猴跨域请求响应超时'))
      }, this.requestTimeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      this.targetWindow.postMessage({
        source: PAGE_SOURCE,
        type: 'LLMPING_USERSCRIPT_FETCH',
        requestId,
        payload: input,
      }, this.targetWindow.location.origin)
    })
  }
}

export const userscriptBridge = new UserscriptBridge(window)

export function createUserscriptFetch(
  bridge: Pick<UserscriptBridge, 'fetch'> = userscriptBridge,
): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const headers = Object.fromEntries(new Headers(init?.headers ?? request?.headers).entries())
    let body: string | undefined
    if (typeof init?.body === 'string') body = init.body
    else if (request && !['GET', 'HEAD'].includes(request.method)) body = await request.clone().text()
    const response = await bridge.fetch({
      url: request?.url ?? String(input),
      method: init?.method ?? request?.method ?? 'GET',
      headers,
      body,
    })
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
}
