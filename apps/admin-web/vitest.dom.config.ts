import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.dom.spec.ts'],
    setupFiles: ['src/test/domSetup.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    fileParallelism: false,
    testTimeout: 5000,
    hookTimeout: 5000,
  },
})
