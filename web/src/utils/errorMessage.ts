const errorReplacements: Array<[RegExp, string]> = [
  [/context deadline exceeded\s*\(Client\.Timeout exceeded while awaiting headers\)/gi, '请求超时（等待响应头超时）'],
  [/Client\.Timeout exceeded while awaiting headers/gi, '等待响应头超时'],
  [/context deadline exceeded/gi, '请求超时'],
  [/connection refused/gi, '连接被拒绝'],
  [/no such host/gi, '域名解析失败'],
  [/failed to fetch/gi, '网络请求失败'],
  [/upstream access forbidden, please contact administrator/gi, '上游访问被拒绝，请联系管理员'],
  [/upstream service temporarily unavailable/gi, '上游服务暂时不可用'],
  [/service temporarily unavailable/gi, '服务暂时不可用'],
  [/no cached tokens in response — backend may be degraded/gi, '响应中未发现缓存 token，上游服务可能异常'],
  [/token may be expired or invalid/gi, 'token 可能已过期或无效'],
  [/unauthorized/gi, '未授权'],
  [/request failed/gi, '请求失败'],
  [/login failed/gi, '登录失败'],
  [/refresh failed/gi, '刷新 token 失败'],
  [/list groups failed/gi, '获取分组失败'],
  [/list keys failed/gi, '获取 API Key 列表失败'],
  [/create key failed/gi, '创建 API Key 失败'],
  [/get rates failed/gi, '获取倍率失败'],
  [/parse ([^:]+) response/gi, '解析$1响应失败'],
  [/parse ([^:]+) data/gi, '解析$1数据失败'],
  [/server error/gi, '服务端错误'],
  [/unsupported platform/gi, '不支持的平台'],
  [/save channel/gi, '保存信道'],
  [/build url/gi, '构建 URL'],
  [/create request/gi, '创建请求'],
  [/read response/gi, '读取响应'],
  [/name, baseUrl and model are required/gi, '请填写信道名称、Base URL 和模型'],
  [/provider must be openai or anthropic/gi, '协议仅支持 OpenAI 或 Anthropic'],
  [/apiKey is required for a new channel/gi, '新建信道时必须填写 API Key'],
  [/baseUrl and email are required/gi, '请填写 Base URL 和邮箱'],
  [/password or refreshToken is required for a new account/gi, '新建账号时必须填写密码或 refresh token'],
  [/baseUrl and token query params required/gi, '缺少 Base URL 或 token 参数'],
  [/baseUrl, accessToken, and groupIds are required/gi, '缺少 Base URL、access token 或分组 ID'],
  [/token expired and no password stored — please re-enter credentials/gi, 'token 已过期且未保存密码，请重新输入凭据'],
]

export function localizeErrorMessage(value: unknown, fallback = '操作失败'): string {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : ''
  if (!raw.trim()) return fallback
  return errorReplacements.reduce((message, [pattern, replacement]) => message.replace(pattern, replacement), raw)
}
