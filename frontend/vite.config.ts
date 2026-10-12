import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        entry: 'src/preload/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@components': path.resolve(__dirname, './src/renderer/components'),
      '@hooks': path.resolve(__dirname, './src/renderer/hooks'),
      '@store': path.resolve(__dirname, './src/renderer/store'),
      '@services': path.resolve(__dirname, './src/renderer/services'),
      '@types': path.resolve(__dirname, './src/renderer/types'),
      '@utils': path.resolve(__dirname, './src/renderer/utils')
    }
  },
  server: {
    port: 5173
  }
})

