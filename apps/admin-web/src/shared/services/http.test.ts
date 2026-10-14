import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ApiClientError, apiRequestWithStatus, buildApiUrl, getApiBaseUrl, unwrapApiResponse } from './http.js'
import { getApiMode, resolveApiMode } from './apiMode.js'

describe('admin http client foundation', () => {
  it('unwraps unified success responses', () => {
    const data = unwrapApiResponse({
      success: true,
      data: { ok: true },
      error: null,
      requestId: 'req-1',
    })

    assert.deepEqual(data, { ok: true })
  })

  it('throws a typed error for unified backend errors', () => {
    assert.throws(
      () =>
        unwrapApiResponse({
          success: false,
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: '请求参数不合法',
            details: { issues: [{ path: 'page', message: 'must be >= 1' }] },
          },
          requestId: 'req-2',
        }),
      (error) =>
        error instanceof ApiClientError &&
        error.code === 'VALIDATION_ERROR' &&
        error.requestId === 'req-2' &&
        error.message === '请求参数不合法',
    )
  })

  it('builds backend URLs with query parameters', () => {
    assert.equal(
      buildApiUrl('http://localhost:3001', '/novels', { page: 2, pageSize: 20, keyword: '逆袭' }),
      'http://localhost:3001/novels?page=2&pageSize=20&keyword=%E9%80%86%E8%A2%AD',
    )
  })

  it('preserves HTTP status, backend request ID and details on business errors', async () => {
    const originalFetch = globalThis.fetch
    try {
      for (const status of [409, 503]) {
        globalThis.fetch = async () => new Response(JSON.stringify({ success: false, requestId: 'server-request',
          error: { code: 'VERSION_CONFLICT', message: 'source changed', details: { currentVersionId: 'v2' } } }), { status })
        await assert.rejects(apiRequestWithStatus('/dispatch'), (error) => {
          assert.ok(error instanceof ApiClientError)
          assert.equal(error.code, 'VERSION_CONFLICT')
          assert.equal(error.httpStatus, status)
          assert.equal(error.requestId, 'server-request')
          assert.deepEqual(error.details, { currentVersionId: 'v2' })
          return true
        })
      }
      assert.equal(new ApiClientError('VERSION_CONFLICT', 'source changed').httpStatus, undefined)
    } finally { globalThis.fetch = originalFetch }
  })

  it('keeps malformed bodies INVALID_RESPONSE while retaining the received HTTP status', async () => {
    const originalFetch = globalThis.fetch
    try {
      for (const status of [202, 503]) {
        for (const body of ['not JSON', 'null', '{}', '{"success":"true"}',
          '{"success":false,"error":null}', '{"success":false,"error":{"message":"missing code"}}']) {
          globalThis.fetch = async () => new Response(body, { status })
          await assert.rejects(apiRequestWithStatus('/dispatch'), (error) =>
            error instanceof ApiClientError && error.code === 'INVALID_RESPONSE' && error.httpStatus === status)
        }
      }
      globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 409 })
      await assert.rejects(apiRequestWithStatus('/dispatch'), (error) =>
        error instanceof ApiClientError && error.code === 'INVALID_RESPONSE' && error.httpStatus === 409)
    } finally { globalThis.fetch = originalFetch }
  })

  it('retains successful dispatch status and request options without changing network error semantics', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async (_input, init) => {
        assert.equal(init?.method, 'POST')
        assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'original-key')
        assert.equal(init?.body, JSON.stringify({ reason: 'original request' }))
        return new Response(JSON.stringify({ success: true, data: { taskId: 'task-1' } }), { status: 202 })
      }
      assert.deepEqual(await apiRequestWithStatus('/dispatch', { method: 'POST',
        headers: { 'Idempotency-Key': 'original-key' }, body: { reason: 'original request' } }),
      { status: 202, data: { taskId: 'task-1' } })
      globalThis.fetch = async () => { throw new Error('connection lost') }
      await assert.rejects(apiRequestWithStatus('/dispatch'), (error) =>
        error instanceof ApiClientError && error.code === 'NETWORK_ERROR' && error.httpStatus === undefined)
    } finally { globalThis.fetch = originalFetch }
  })

  it('resolves data source mode with backend as the default', () => {
    assert.equal(resolveApiMode(undefined), 'backend')
    assert.equal(resolveApiMode('mock'), 'mock')
    assert.equal(resolveApiMode('backend'), 'backend')
    assert.equal(resolveApiMode('unexpected'), 'backend')
    assert.equal(getApiMode(), 'backend')
    assert.equal(getApiBaseUrl(), 'http://localhost:3001')
  })
})
