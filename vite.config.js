import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // 警告が出るサイズの上限を上げます（これで警告が消えます）
    chunkSizeWarningLimit: 1000,
  }
})