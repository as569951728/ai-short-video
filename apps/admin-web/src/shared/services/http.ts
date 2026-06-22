import type { ApiResponse, ErrorCode } from '@ai-shortvideo/shared'

type QueryValue = string | number | boolean | null | undefined

export class ApiClientError extends Error {
  readonly code: ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE'
  readonly requestId?: string
  readonly details?: unknown

  constructor(code: ApiClientError['code'], message: string, requestId?: string, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  query?: Record<string, QueryValue>
  body?: unknown
}

export function getApiBaseUrl() {
  return getViteEnv().VITE_API_BASE_URL || 'http://localhost:3001'
}

export function buildApiUrl(baseUrl: string, path: string, query: Record<string, QueryValue> = {}) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  const url = new URL(normalizedPath, normalizedBaseUrl)

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  return url.toString()
}

export function unwrapApiResponse<TData>(response: ApiResponse<TData>): TData {
  if (response.success) {
    return response.data
  }

  throw new ApiClientError(response.error.code, response.error.message, response.requestId, response.error.details)
}

export async function apiRequest<TData>(path: string, options: ApiRequestOptions = {}) {
  const { query, body, headers, ...requestOptions } = options
  const requestId = createRequestId()
  const response = await fetch(buildApiUrl(getApiBaseUrl(), path, query), {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((error: unknown) => {
    throw new ApiClientError('NETWORK_ERROR', error instanceof Error ? error.message : '网络请求失败', requestId)
  })

  const payload = await parseJsonResponse(response, requestId)

  try {
    return unwrapApiResponse(payload as ApiResponse<TData>)
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error
    }

    throw new ApiClientError('INVALID_RESPONSE', '后端响应格式不符合统一结构', requestId, payload)
  }
}

async function parseJsonResponse(response: Response, requestId: string) {
  try {
    return await response.json()
  } catch {
    throw new ApiClientError('INVALID_RESPONSE', '后端响应不是有效 JSON', requestId)
  }
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getViteEnv() {
  return ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {})
}
