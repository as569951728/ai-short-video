import { afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: TestResizeObserver,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

config.global.config.warnHandler = (message) => {
  if (message.includes('Failed to resolve component')) {
    throw new Error(message)
  }
}

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.innerHTML = ''
  document.body.removeAttribute('class')
  document.body.removeAttribute('style')
})
