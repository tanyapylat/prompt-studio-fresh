import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/apiPlugin'
import { fontsourceAssets } from './server/fontsourceAssets'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loads app/.env (and app/.env.local) into process.env for the dev-server-side API
  // plugin ONLY — these are not the VITE_-prefixed vars Vite would inline into client code,
  // so the key never reaches the browser bundle. A real value in .env wins over whatever the
  // OS environment happens to already have (which, on some machines, is a stray literal
  // "undefined" string rather than an actual unset variable).
  const env = loadEnv(mode, process.cwd(), '')
  if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY

  const publicBase = (process.env.VITE_PUBLIC_BASE_URL || env.VITE_PUBLIC_BASE_URL || '').replace(/\/$/, '')

  return {
    base: publicBase ? `${publicBase}/` : '/',
    plugins: [react(), apiPlugin(), fontsourceAssets()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
