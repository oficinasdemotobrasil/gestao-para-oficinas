import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './estilos/globais.css'

/**
 * Mantém o app atualizado sozinho.
 *
 * Numa oficina o app fica instalado na tela de início e aberto o dia inteiro:
 * sem isto, o celular pode continuar rodando a versão de semanas atrás, com
 * defeitos já corrigidos. A verificação a cada meia hora custa alguns bytes e
 * evita a pior classe de problema — a que já foi resolvida e continua doendo.
 */
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    setInterval(() => void registro.update(), 30 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
