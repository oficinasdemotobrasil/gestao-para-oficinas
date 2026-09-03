import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  // O Vite crava a 5173 por padrão e ignora a variável PORT. Quando a porta já
  // está ocupada, o ambiente atribui outra e a informa por aqui — sem isto, o
  // servidor tenta subir na porta errada e falha.
  //
  // Atenção: a URL de recuperação de senha cadastrada no Supabase aponta para
  // http://localhost:5173/redefinir-senha. Rodando em outra porta, só esse
  // fluxo específico deixa de funcionar em desenvolvimento; o resto do app
  // funciona igual.
  server: { port: Number(process.env.PORT) || 5173 },
  preview: { port: Number(process.env.PORT) || 4173 },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    rollupOptions: {
      output: {
        // Separa as bibliotecas do código do app: numa atualização, o celular
        // baixa só a parte que mudou. Importa para quem está na internet da oficina.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          formulario: ['react-hook-form', 'zod', '@hookform/resolvers/zod'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'offline.html',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'Gestão para Oficinas',
        short_name: 'Oficinas',
        description: 'Gestão para oficinas de moto',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B0B0C',
        theme_color: '#0B0B0C',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // O jsPDF traz html2canvas e dompurify para converter HTML em PDF —
        // recurso que este app não usa (o PDF é desenhado direto). São mais de
        // 200 KB que o service worker baixaria na instalação para nunca abrir.
        globIgnores: ['**/html2canvas*.js', '**/purify*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        // O shell do app fica em cache; dados do Supabase nunca são cacheados,
        // para não mostrar preço ou estoque desatualizado dentro da oficina.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/icons/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'icones',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
