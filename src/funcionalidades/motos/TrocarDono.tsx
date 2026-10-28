/**
 * Trocar o dono da moto (0087).
 *
 * O caso que trouxe isto: a moto foi vendida, o comprador chegou à oficina e
 * não havia como fazer o orçamento no nome dele. O dono antigo não some: fica
 * no histórico da moto como anterior, e continua cliente com a ficha inteira.
 * Orçamentos, ordens e contas antigas seguem no nome de quem pediu e pagou.
 */
import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert, User } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Modal'
import { FolhaDeBusca, type OpcaoDeBusca } from '@/componentes/ui/FolhaDeBusca'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { data, exibirPlaca, hojeNoAparelho, telefone as formatarTelefone } from '@/lib/formato'
import { listarClientes } from '@/funcionalidades/clientes/api'
import { ModalClienteRapido } from '@/funcionalidades/orcamentos/SeletorClienteMoto'
import { desfazerTrocaDeDono, pendenciasDaMoto, trocarDono } from './api'

type Pessoa = { id: string; nome: string }

/** O que muda de tela quando o dono troca: a moto, as fichas e as listas. */
function atualizarTelas(cache: ReturnType<typeof useQueryClient>) {
  for (const chave of ['moto', 'motos', 'cliente', 'clientes', 'ficha-do-cliente', 'ficha-da-moto', 'historico-da-placa']) {
    void cache.invalidateQueries({ queryKey: [chave] })
  }
}

export function JanelaTrocarDono({
  aberto,
  aoFechar,
  moto,
  donoAtual,
}: {
  aberto: boolean
  aoFechar: () => void
  moto: { id: string; placa: string }
  donoAtual: Pessoa | null
}) {
  const toast = useToast()
  const cache = useQueryClient()
  const [novo, setNovo] = useState<Pessoa | null>(null)
  const [quando, setQuando] = useState(hojeNoAparelho())
  const [buscando, setBuscando] = useState(false)
  const [cadastrando, setCadastrando] = useState(false)

  const pendencias = useQuery({
    queryKey: ['moto', moto.id, 'pendencias'],
    queryFn: () => pendenciasDaMoto(moto.id),
    enabled: aberto,
  })

  const buscarClientes = useCallback(
    async (termo: string): Promise<OpcaoDeBusca[]> =>
      (await listarClientes(termo))
        .filter((c) => c.id !== donoAtual?.id)
        .map((c) => ({
          id: `${c.id}|${c.nome}`,
          titulo: c.nome,
          descricao: c.telefone ? formatarTelefone(c.telefone) : 'Sem telefone',
        })),
    [donoAtual?.id],
  )

  function fechar() {
    setNovo(null)
    setQuando(hojeNoAparelho())
    aoFechar()
  }

  const trocar = useMutation({
    mutationFn: () => trocarDono(moto.id, novo!.id, quando),
    onSuccess: (r) => {
      atualizarTelas(cache)
      toast.sucesso(
        r.anterior
          ? `Pronto: a moto agora é de ${r.novo}. ${r.anterior} fica no histórico como dono anterior.`
          : `Pronto: a moto agora é de ${r.novo}.`,
      )
      fechar()
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const hoje = hojeNoAparelho()
  const lista = pendencias.data ?? []

  return (
    <>
      <Modal
        aberto={aberto && !buscando && !cadastrando}
        aoFechar={fechar}
        titulo="Trocar o dono da moto"
        rodape={
          <Botao
            largo
            carregando={trocar.isPending}
            disabled={!novo || !quando || quando > hoje}
            onClick={() => trocar.mutate()}
          >
            Trocar dono
          </Botao>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-corpo text-em-superficie-2">
            {exibirPlaca(moto.placa)}
            {donoAtual ? ` · hoje no nome de ${donoAtual.nome}` : ' · sem dono registrado'}
          </p>

          <div className="flex flex-col gap-1">
            <span className="text-rotulo text-em-superficie-2">Novo dono</span>
            <Botao
              // Dentro da janela o fundo é branco: a variante "contorno" é a do
              // fundo preto da tela, e deixava o nome escolhido invisível.
              variante="contorno-no-card"
              largo
              icone={<User aria-hidden size={18} />}
              onClick={() => setBuscando(true)}
            >
              {novo ? novo.nome : 'Escolher o novo dono'}
            </Botao>
          </div>

          <Campo
            rotulo="Data da troca"
            type="date"
            max={hoje}
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            dica="Se a moto foi vendida antes de hoje, escolha o dia da venda."
          />

          {lista.length > 0 && (
            <div
              role="note"
              className="flex gap-3 rounded-controle bg-atencao-fundo px-4 py-3 text-corpo text-atencao-forte"
            >
              <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />
              <p>
                Esta moto tem em andamento:{' '}
                {lista
                  .map(
                    (x) =>
                      `${x.tipo === 'orcamento' ? 'orçamento' : 'ordem de serviço'} nº ${String(x.numero).padStart(4, '0')}${x.cliente ? ` (${x.cliente})` : ''}`,
                  )
                  .join(', ')}
                . Eles continuam no nome de quem pediu.
              </p>
            </div>
          )}

          {novo && quando && quando <= hoje && (
            <p className="text-corpo text-em-superficie">
              {donoAtual
                ? `A moto passa de ${donoAtual.nome} para ${novo.nome} a partir de ${data(quando)}. ${donoAtual.nome} continua no histórico como dono anterior.`
                : `A moto fica no nome de ${novo.nome} a partir de ${data(quando)}.`}
            </p>
          )}
        </div>
      </Modal>

      <FolhaDeBusca
        aberto={buscando}
        aoFechar={() => setBuscando(false)}
        titulo="Novo dono"
        placeholder="Nome ou telefone"
        buscar={buscarClientes}
        aoEscolher={(composta) => {
          const [id, nome] = composta.split('|')
          setNovo({ id, nome })
          setBuscando(false)
        }}
        rotuloCriar="Cadastrar cliente novo"
        aoCriar={() => {
          setBuscando(false)
          setCadastrando(true)
        }}
        vazio={{
          titulo: 'Nenhum cliente encontrado',
          descricao: 'Cadastre o novo dono aqui mesmo: nome e telefone bastam.',
        }}
      />

      <ModalClienteRapido
        aberto={cadastrando}
        aoFechar={() => setCadastrando(false)}
        aoCriar={(cliente) => {
          setNovo(cliente)
          setCadastrando(false)
        }}
      />
    </>
  )
}

/** Desfazer a troca feita por engano — a moto volta para quem era dono. */
export function JanelaDesfazerTroca({
  aberto,
  aoFechar,
  motoId,
  anterior,
  atual,
}: {
  aberto: boolean
  aoFechar: () => void
  motoId: string
  anterior: string
  atual: string
}) {
  const toast = useToast()
  const cache = useQueryClient()
  const desfazer = useMutation({
    mutationFn: () => desfazerTrocaDeDono(motoId),
    onSuccess: (r) => {
      atualizarTelas(cache)
      toast.sucesso(`Troca desfeita: a moto voltou para ${r.dono ?? anterior}.`)
      aoFechar()
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Desfazer a troca de dono"
      rodape={
        <Botao largo carregando={desfazer.isPending} onClick={() => desfazer.mutate()}>
          Desfazer troca
        </Botao>
      }
    >
      <p className="pb-2 text-corpo text-em-superficie-2">
        A moto volta para {anterior}, e {atual} sai do histórico desta moto (continua cliente
        normalmente). Só dá para desfazer enquanto não foi feito orçamento nem ordem de serviço
        depois da troca.
      </p>
    </Modal>
  )
}
