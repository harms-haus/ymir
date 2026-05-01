import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'

const acpPackages = path.join(os.homedir(), 'acp-chat-ui-react', 'packages')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@harms-haus/acp-chat-core': path.resolve(acpPackages, 'acp-chat-core/src'),
      '@harms-haus/acp-chat-react': path.resolve(acpPackages, 'acp-chat-react/src'),
      '@harms-haus/acp-ws-bridge': path.resolve(acpPackages, 'acp-ws-bridge/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    maxWorkers: 1,
    alias: {
      '@harms-haus/acp-chat-core': path.resolve(acpPackages, 'acp-chat-core/src'),
      '@harms-haus/acp-chat-react': path.resolve(acpPackages, 'acp-chat-react/src'),
      '@harms-haus/acp-ws-bridge': path.resolve(acpPackages, 'acp-ws-bridge/src'),
    },
  },
})
