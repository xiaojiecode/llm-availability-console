export type BrowserExtensionStatus = 'checking' | 'connected' | 'unavailable'

export interface ExtensionFetchInput {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface ExtensionFetchResponse {
  ok: boolean
  status: number
  body: string
}

interface BridgeResponse {
  ok: boolean
  response?: ExtensionFetchResponse
  error?: string
}

interface PendingRequest {
  resolve: (response: ExtensionFetchResponse) => void
  reject: (error: Error) => void
  timeout: number
}

const PAGE_SOURCE = 'llmping-page'
const EXTENSION_SOURCE = 'llmping-extension'

export class BrowserExtensionUnavailableError extends Error {
  constructor() {
    super('浏览器扩展未连接')
    this.name = 'BrowserExtensionUnavailableError'
  }
}

export class BrowserExtensionBridge {
  private status: BrowserExtensionStatus = 'checking'
  private started = false
  private sequence = 0
  private checkTimeout?: number
  private connectionPromise?: Promise<boolean>
  private readonly listeners = new Set<(status: BrowserExtensionStatus) => void>()
  private readonly pending = new Map<string, PendingRequest>()

  constructor(
    private readonly targetWindow: Window,
    private readonly handshakeTimeoutMs = 700,
    private readonly requestTimeoutMs = 17_000,
  ) {}

  private setStatus(status: BrowserExtensionStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of this.listeners) listener(status)
  }

  private readonly handleMessage = (event: MessageEvent) => {
    if (event.source !== this.targetWindow || event.origin !== this.targetWindow.location.origin) return
    const message = event.data as { source?: string; type?: string; requestId?: string; payload?: BridgeResponse }
    if (message?.source !== EXTENSION_SOURCE) return

    if (message.type === 'LLMPING_EXTENSION_READY') {
      if (this.checkTimeout) this.targetWindow.clearTimeout(this.checkTimeout)
      this.setStatus('connected')
      return
    }

    if (message.type !== 'LLMPING_EXTENSION_RESPONSE' || !message.requestId) return
    const request = this.pending.get(message.requestId)
    if (!request) return
    this.pending.delete(message.requestId)
    this.targetWindow.clearTimeout(request.timeout)
    const payload = message.payload
    if (payload?.ok && payload.response) request.resolve(payload.response)
    else request.reject(new Error(payload?.error || '浏览器扩展请求失败'))
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
      request.reject(new Error('扩展连接已关闭'))
    }
    this.pending.clear()
  }

  recheck() {
    this.setStatus('checking')
    this.targetWindow.postMessage({ source: PAGE_SOURCE, type: 'LLMPING_EXTENSION_PING' }, this.targetWindow.location.origin)
    if (this.checkTimeout) this.targetWindow.clearTimeout(this.checkTimeout)
    this.checkTimeout = this.targetWindow.setTimeout(() => this.setStatus('unavailable'), this.handshakeTimeoutMs)
  }

  getStatus() {
    return this.status
  }

  subscribe(listener: (status: BrowserExtensionStatus) => void) {
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

  async fetch(input: ExtensionFetchInput): Promise<ExtensionFetchResponse> {
    if (!this.started) this.start()
    if (!await this.waitForConnection()) throw new BrowserExtensionUnavailableError()

    const requestId = `probe-${Date.now()}-${++this.sequence}`
    return new Promise<ExtensionFetchResponse>((resolve, reject) => {
      const timeout = this.targetWindow.setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('等待浏览器扩展响应超时'))
      }, this.requestTimeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      this.targetWindow.postMessage({
        source: PAGE_SOURCE,
        type: 'LLMPING_EXTENSION_FETCH',
        requestId,
        payload: input,
      }, this.targetWindow.location.origin)
    })
  }
}

export const browserExtensionBridge = new BrowserExtensionBridge(window)
