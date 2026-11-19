import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// In development the .NET server runs separately (`dotnet run`, http://localhost:5080);
// Vite proxies API calls to it so the browser sees one origin, as in production.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5080',
      '/health': 'http://localhost:5080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
