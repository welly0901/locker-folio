import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 监听所有网卡，方便手机等同一局域网设备用 IP:端口 访问
  server: { host: true, port: 5178 },
  preview: { host: true, port: 4178 },
})
