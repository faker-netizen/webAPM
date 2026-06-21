import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      rrweb: resolve(__dirname, 'node_modules/rrweb')
    }
  },
  server: {
    fs: {
      allow: [
        resolve(__dirname, '..')
      ]
    }
  }
})
