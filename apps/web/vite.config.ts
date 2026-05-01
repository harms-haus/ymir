import { defineConfig } from 'vite'
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
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': {
        target: 'http://localhost:7319',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },
})
