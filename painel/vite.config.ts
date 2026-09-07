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
 * Fixa de propósito: quem precisar de outra usa `vite --port`. Ler a porta de
 * uma variável de ambiente aqui exigiria os tipos do Node só para isso, e foi
 * o que quebrou o primeiro build na Vercel.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5273 },
  preview: { port: 4273 },
})
