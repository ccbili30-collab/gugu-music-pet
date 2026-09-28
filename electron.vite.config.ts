import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    base: './',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          pet: resolve('src/renderer/pet.html'),
          chat: resolve('src/renderer/chat.html'),
          login: resolve('src/renderer/login.html')
        }
      }
    }
  }
})
