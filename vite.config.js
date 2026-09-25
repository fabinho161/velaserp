import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { cwd, env as processEnv } from 'node:process'
import { resolverApiUrl } from './src/config/apiUrl.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), '')
  const envApi = mode === 'production' ? processEnv : env
  const apiUrl = resolverApiUrl({
    mode,
    apiBaseUrl: envApi.VITE_API_BASE_URL,
    apiUrl: envApi.VITE_API_URL,
  })

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL_RESOLVIDA': JSON.stringify(apiUrl),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
  }
})
