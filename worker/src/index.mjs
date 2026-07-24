const FORWARDED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])
const STRIPPED_REQUEST_HEADERS = new Set([
  'cookie',
  'host',
  'origin',
  'referer',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
])

function csvSet(value = '') {
  return new Set(value.split(',').map((item) => item.trim()).filter(Boolean))
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
    'access-control-max-age': '86400',
    'access-control-expose-headers': 'content-type, x-request-id',
    'vary': 'Origin, Access-Control-Request-Headers',
  }
}

function response(message, status, origin = '') {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  if (origin) Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value))
  return new Response(JSON.stringify({ error: message }), { status, headers })
}

export function createHandler(fetchImpl = fetch) {
  return async function handle(request, env) {
    const requestUrl = new URL(request.url)
    const origin = request.headers.get('origin') || ''
    if (!csvSet(env.ALLOWED_ORIGINS).has(origin)) return response('origin is not allowed', 403)

    const targetValue = requestUrl.searchParams.get('url')
    if (!targetValue) return response('url is required', 400, origin)

    let targetUrl
    try {
      targetUrl = new URL(targetValue)
    } catch {
      return response('url is invalid', 400, origin)
    }
    if (targetUrl.protocol !== 'https:' || !csvSet(env.ALLOWED_HOSTS).has(targetUrl.hostname)) {
      return response('target is not allowed', 403, origin)
    }
    if (!env.PROXY_TOKEN || requestUrl.searchParams.get('token') !== env.PROXY_TOKEN) {
      return response('proxy token is invalid', 401, origin)
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (!FORWARDED_METHODS.has(request.method)) return response('method is not allowed', 405, origin)

    const headers = new Headers(request.headers)
    for (const name of [...headers.keys()]) {
      if (STRIPPED_REQUEST_HEADERS.has(name) || name.startsWith('cf-')) headers.delete(name)
    }
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
    const upstream = await fetchImpl(new Request(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    }))
    const responseHeaders = new Headers(upstream.headers)
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => responseHeaders.set(key, value))
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
  }
}

export default {
  fetch: createHandler(),
}
