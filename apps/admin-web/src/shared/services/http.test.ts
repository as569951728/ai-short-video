import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ApiClientError, buildApiUrl, getApiBaseUrl, unwrapApiResponse } from './http.js'
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

  it('resolves data source mode with backend as the default', () => {
    assert.equal(resolveApiMode(undefined), 'backend')
    assert.equal(resolveApiMode('mock'), 'mock')
    assert.equal(resolveApiMode('backend'), 'backend')
    assert.equal(resolveApiMode('unexpected'), 'backend')
    assert.equal(getApiMode(), 'backend')
    assert.equal(getApiBaseUrl(), 'http://localhost:3001')
  })
})
