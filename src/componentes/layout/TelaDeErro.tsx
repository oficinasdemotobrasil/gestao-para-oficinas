/**
 * Quando uma tela quebra por erro de programação (auditoria de 21/10/2026).
 *
 * Sem isto, o roteador mostrava a página padrão dele — em inglês, com o rastro
 * técnico do erro na tela do dono da oficina. Aqui a pessoa lê o que houve e
 * tem dois caminhos: recarregar, que resolve quase sempre (inclusive quando
 * saiu versão nova do app no meio do uso), ou voltar ao início.
 *
 * Erro de busca de dados não chega aqui: cada tela já mostra o seu "tente de
 * novo". Esta é a rede embaixo de tudo.
 */
import { useRouteError } from 'react-router-dom'
import { Botao } from '@/componentes/ui/Botao'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'

export function TelaDeErro() {
  const erro = useRouteError()
  console.error(erro)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-fundo px-4">
      <EstadoErro
        titulo="Algo deu errado nesta tela"
        descricao="O que você já tinha salvo continua salvo. Toque em tentar de novo para recarregar; se o erro voltar, fale com a gente."
        aoTentarDeNovo={() => window.location.reload()}
      />
      <Botao variante="contorno" onClick={() => window.location.assign('/')}>
        Ir para o início
      </Botao>
    </main>
  )
}
