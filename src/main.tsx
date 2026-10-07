import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './estilos/globais.css'
import { aplicarCorDaMarca, marcaLembrada } from './lib/marca'
import { aplicarTema, temaEscolhido } from './lib/tema'
import { cuidarDaMudancaDeEndereco } from './lib/endereco'

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

/**
 * Partes do app descem sob demanda (o PDF, o certificado, o leitor de nota).
 * Se o site foi atualizado com a tela aberta, o pedaço antigo pode não existir
 * mais no servidor e a importação falha — a tela ficaria parada num erro.
 * Recarregar traz a versão nova inteira. Uma vez por minuto no máximo, para
 * um problema de verdade (sem internet) não virar recarga sem fim.
 */
window.addEventListener('vite:preloadError', (evento) => {
  try {
    const ultima = Number(sessionStorage.getItem('recarregou-por-versao') ?? 0)
    if (Date.now() - ultima < 60_000) return
    sessionStorage.setItem('recarregou-por-versao', String(Date.now()))
  } catch {
    return
  }
  evento.preventDefault()
  window.location.reload()
})

// O GIRO mudou para usegiromotos.com (07/10/2026). Ver lib/endereco.ts.
cuidarDaMudancaDeEndereco()

/**
 * A cor da última oficina que entrou neste aparelho, aplicada antes da
 * primeira tela pintar. Sem isto, quem abre o app veria o amarelo do produto
 * por um instante e depois a própria cor — o pisca-pisca que denuncia gambiarra.
 */
aplicarTema(temaEscolhido())
aplicarCorDaMarca(marcaLembrada()?.cor)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
