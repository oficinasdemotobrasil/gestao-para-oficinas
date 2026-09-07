import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * O painel da plataforma é um aplicativo à parte, com publicação própria.
 *
 * Ele não importa nada do aplicativo do cliente — nem um componente, nem um
 * tipo. A separação existe para que uma mudança lá não possa, por descuido,
 * abrir alguma coisa aqui, e vice-versa.
 *
 * Porta diferente da do app para os dois poderem rodar ao mesmo tempo.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5273 },
  preview: { port: Number(process.env.PORT) || 4273 },
})
