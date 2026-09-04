import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserX, MessageCircle } from 'lucide-react'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { Card } from '@/componentes/ui/Card'
import { Campo, AreaTexto } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { exibirPlaca, data, telefone as formatarTelefone, primeiroNome } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import { listarClientesInativos, type ClienteInativo } from '@/funcionalidades/painel/api'

/**
 * A mensagem que a oficina manda para quem sumiu.
 *
 * Vem escrita, mas editável: um texto pronto que ninguém pode mudar acaba
 * soando igual para todo mundo, e o cliente percebe. Aqui ela é ponto de
 * partida — o dono ajusta antes de enviar.
 */
function mensagemPadrao(c: ClienteInativo, nomeDaOficina: string): string {
  const nome = primeiroNome(c.nome)
  const moto = [c.marca, c.modelo].filter(Boolean).join(' ') || 'sua moto'
  const servico = c.ultimo_servico ? ` para ${c.ultimo_servico.toLowerCase()}` : ''

  return [
    `Olá, ${nome}! Tudo bem?`,
    '',
    `Aqui é da ${nomeDaOficina}. Vi que faz ${c.dias_sem_voltar} dias que a sua ${moto} passou aqui${servico}.`,
    '',
    'Está tudo certo com ela? Se quiser fazer uma revisão ou tirar alguma dúvida, é só chamar por aqui.',
  ].join('\n')
}

function enderecoDoWhatsApp(texto: string, tel: string | null): string {
  const codificado = encodeURIComponent(texto)
  const digitos = (tel ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) {
    return `https://wa.me/55${digitos}?text=${codificado}`
  }
  if (digitos.length === 12 || digitos.length === 13) {
    return `https://wa.me/${digitos}?text=${codificado}`
  }
  return `https://wa.me/?text=${codificado}`
}

export function ClientesInativos() {
  const { oficina } = useAuth()
  const [dias, setDias] = useState('')
  const [escrevendo, setEscrevendo] = useState<ClienteInativo | null>(null)
  const [texto, setTexto] = useState('')

  const regua = dias ? Number(dias) : null

  const { data: lista, isPending, isError, refetch } = useQuery({
    queryKey: ['clientes-inativos', regua],
    queryFn: () => listarClientesInativos(regua),
  })

  function escrever(c: ClienteInativo) {
    setTexto(mensagemPadrao(c, oficina?.nome ?? 'oficina'))
    setEscrevendo(c)
  }

  return (
    <Tela>
      <CabecalhoInterno
        titulo="Quem sumiu"
        contexto="Clientes sem serviço concluído há um tempo"
      />

      <Campo
        rotulo="A partir de quantos dias"
        inputMode="numeric"
        placeholder={String(oficina?.dias_para_cliente_inativo ?? 30)}
        dica="Deixe vazio para usar o padrão da oficina."
        value={dias}
        onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))}
      />

      <div className="pt-6">
        {isPending ? (
          <EsqueletoLista />
        ) : isError ? (
          <EstadoErro aoTentarDeNovo={() => void refetch()} />
        ) : lista.length === 0 ? (
          <EstadoVazio
            icone={<UserX aria-hidden size={28} />}
            titulo="Ninguém sumido"
            descricao="Todo mundo que passou por aqui voltou dentro do prazo, ou está com a moto na oficina agora."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {lista.map((c) => (
              <Card key={c.cliente_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-corpo font-medium text-claro">{c.nome}</p>
                    {c.telefone && (
                      <p className="text-apoio text-claro-secundario">
                        {formatarTelefone(c.telefone)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-badge bg-atencao-fundo px-2.5 py-1 text-apoio font-medium text-atencao">
                    {c.dias_sem_voltar} dias
                  </span>
                </div>

                <p className="pt-3 text-apoio text-claro-secundario">
                  {c.placa ? exibirPlaca(c.placa) : 'sem moto'}
                  {[c.marca, c.modelo].filter(Boolean).length > 0 &&
                    ` · ${[c.marca, c.modelo].filter(Boolean).join(' ')}`}
                </p>
                <p className="text-apoio text-claro-secundario">
                  Última vez: {data(c.ultima_visita)}
                  {c.ultimo_servico && ` · ${c.ultimo_servico}`}
                </p>

                <div className="border-t border-borda-clara pt-3 mt-3">
                  <Botao
                    largo
                    icone={<MessageCircle aria-hidden size={20} />}
                    onClick={() => escrever(c)}
                  >
                    Chamar no WhatsApp
                  </Botao>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        aberto={escrevendo !== null}
        aoFechar={() => setEscrevendo(null)}
        titulo="Mensagem de retorno"
        rodape={
          <a
            href={enderecoDoWhatsApp(texto, escrevendo?.telefone ?? null)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setEscrevendo(null)}
            className="inline-flex h-botao w-full items-center justify-center gap-2 rounded-controle bg-acento px-5 text-corpo font-semibold text-claro active:bg-acento-pressionado"
          >
            <MessageCircle aria-hidden size={20} />
            Abrir no WhatsApp
          </a>
        }
      >
        <p className="pb-4 text-corpo text-claro-secundario">
          Ajuste o texto antes de mandar. Mensagem igual para todo mundo o cliente
          percebe.
        </p>
        <AreaTexto
          rotulo="Mensagem"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={9}
        />
      </Modal>
    </Tela>
  )
}
