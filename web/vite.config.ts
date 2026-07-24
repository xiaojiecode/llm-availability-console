import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]

const cdnImports = {
  vue: 'https://cdn.jsdelivr.net/npm/vue@3.5.40/dist/vue.esm-browser.prod.js',
  'element-plus': 'https://cdn.jsdelivr.net/npm/element-plus@2.14.3/dist/index.full.min.mjs',
  three: 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js',
  gsap: 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/index.js',
  dexie: 'https://cdn.jsdelivr.net/npm/dexie@4.4.4/dist/modern/dexie.min.mjs',
} as const

const cdnStyles = {
  'element-plus/dist/index.css': 'https://cdn.jsdelivr.net/npm/element-plus@2.14.3/dist/index.css',
  'element-plus/theme-chalk/dark/css-vars.css':
    'https://cdn.jsdelivr.net/npm/element-plus@2.14.3/theme-chalk/dark/css-vars.css',
} as const

function productionCdnPlugin(): Plugin {
  const virtualStylePrefix = '\0cdn-style:'

  return {
    name: 'production-cdn-imports',
    apply: 'build',
    enforce: 'pre',
    config() {
      return {
        build: {
          rollupOptions: {
            external: Object.keys(cdnImports),
          },
        },
      }
    },
    resolveId(source) {
      if (source in cdnStyles) {
        return `${virtualStylePrefix}${source}`
      }
    },
    load(id) {
      if (id.startsWith(virtualStylePrefix)) {
        return 'export default undefined'
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'link',
            attrs: { rel: 'preconnect', href: 'https://cdn.jsdelivr.net', crossorigin: '' },
            injectTo: 'head-prepend',
          },
          ...Object.values(cdnStyles).map((href) => ({
            tag: 'link',
            attrs: { rel: 'stylesheet', href },
            injectTo: 'head-prepend' as const,
          })),
          ...Object.values(cdnImports).map((href) => ({
            tag: 'link',
            attrs: { rel: 'modulepreload', href, crossorigin: '' },
            injectTo: 'head-prepend' as const,
          })),
          {
            tag: 'script',
            attrs: { type: 'importmap' },
            children: JSON.stringify({ imports: cdnImports }),
            injectTo: 'head-prepend',
          },
        ]
      },
    },
  }
}

export default defineConfig({
  base: repositoryName ? `/${repositoryName}/` : '/',
  plugins: [productionCdnPlugin(), vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-ui': ['@lucide/vue'],
          'vendor-charts': ['echarts'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
