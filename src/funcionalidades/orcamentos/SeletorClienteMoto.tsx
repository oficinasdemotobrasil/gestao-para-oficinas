import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Bike, ChevronRight } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Modal'
import { FolhaDeBusca, type OpcaoDeBusca } from '@/componentes/ui/FolhaDeBusca'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { exibirPlaca, telefone as formatarTelefone, mascararTelefone, normalizarPlaca } from '@/lib/formato'
import { listarClientes, criarCliente } from '@/funcionalidades/clientes/api'
import { criarMoto } from '@/funcionalidades/motos/api'
import { supabase } from '@/lib/supabase'

export interface EscolhaClienteMoto {
  clienteId: string
  clienteNome: string
  motoId: string
  motoPlaca: string
  motoDescricao: string
  motoKm: number
}

interface Props {
  escolha: Partial<EscolhaClienteMoto>
  aoEscolher: (mudanca: Partial<EscolhaClienteMoto>) => void
  somenteLeitura?: boolean
}

/**
 * Escolhe cliente e moto sem sair do orçamento.
 *
 * A moto vem depois do cliente porque é assim que a conversa acontece no balcão:
 * primeiro quem é, depois qual moto. E os dois podem ser cadastrados na hora —
 * mandar a pessoa para outra tela no meio de um orçamento é perder o fio.
 */
export function SeletorClienteMoto({ escolha, aoEscolher, somenteLeitura = false }: Props) {
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [buscandoMoto, setBuscandoMoto] = useState(false)
  const [criandoCliente, setCriandoCliente] = useState(false)
  const [criandoMoto, setCriandoMoto] = useState(false)

  const buscarClientes = useCallback(async (termo: string): Promise<OpcaoDeBusca[]> => {
    const lista = await listarClientes(termo)
    return lista.map((c) => ({
      id: `${c.id}|${c.nome}`,
      titulo: c.nome,
      descricao: c.telefone ? formatarTelefone(c.telefone) : 'Sem telefone',
    }))
  }, [])

  const buscarMotos = useCallback(
    async (termo: string): Promise<OpcaoDeBusca[]> => {
      // Só as motos do cliente escolhido: no balcão, a moto pertence a alguém.
      const { data } = await supabase
        .from('moto_proprietarios')
        .select('motos(id, placa, marca, modelo, km_atual)')
        .eq('cliente_id', escolha.clienteId ?? '')
        .is('data_fim', null)

      type LinhaMoto = { id: string; placa: string; marca: string | null; modelo: string | null; km_atual: number }
      let motos = (data ?? []).flatMap(
        (l) => ((l as unknown as { motos: LinhaMoto | null }).motos ?? []) as LinhaMoto | LinhaMoto[],
      ) as LinhaMoto[]
      motos = Array.isArray(motos) ? motos.flat() : motos

      if (termo) {
        const placa = normalizarPlaca(termo)
        const t = termo.toLowerCase()
        motos = motos.filter(
          (m) =>
            (placa && m.placa.includes(placa)) ||
            (m.marca ?? '').toLowerCase().includes(t) ||
            (m.modelo ?? '').toLowerCase().includes(t),
        )
      }

      return motos.map((m) => ({
        id: [m.id, m.placa, [m.marca, m.modelo].filter(Boolean).join(' '), m.km_atual].join('|'),
        titulo: exibirPlaca(m.placa),
        descricao: [m.marca, m.modelo].filter(Boolean).join(' ') || 'Sem modelo',
      }))
    },
    [escolha.clienteId],
  )

  const Linha = ({
    rotulo,
    valor,
    apoio,
    Icone,
    aoTocar,
    desabilitado,
  }: {
    rotulo: string
    valor: string | undefined
    apoio?: string
    Icone: typeof User
    aoTocar: () => void
    desabilitado?: boolean
  }) => (
    <button
      type="button"
      onClick={aoTocar}
      disabled={desabilitado || somenteLeitura}
      className="flex min-h-linha w-full items-center gap-3 px-5 text-left disabled:opacity-60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave text-claro">
        <Icone aria-hidden size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-apoio text-claro-secundario">{rotulo}</span>
        <span className="truncate text-corpo font-medium text-claro">
          {valor ?? 'Toque para escolher'}
        </span>
        {apoio && <span className="truncate text-apoio text-claro-secundario">{apoio}</span>}
      </span>
      {!somenteLeitura && (
        <ChevronRight aria-hidden size={20} className="shrink-0 text-claro-secundario" />
      )}
    </button>
  )

  return (
    <>
      <div className="overflow-hidden rounded-card bg-superficie shadow-card [&>*+*]:border-t [&>*+*]:border-borda-clara">
        <Linha
          rotulo="Cliente"
          valor={escolha.clienteNome}
          Icone={User}
          aoTocar={() => setBuscandoCliente(true)}
        />
        <Linha
          rotulo="Moto"
          valor={escolha.motoPlaca ? exibirPlaca(escolha.motoPlaca) : undefined}
          apoio={escolha.motoDescricao}
          Icone={Bike}
          desabilitado={!escolha.clienteId}
          aoTocar={() => setBuscandoMoto(true)}
        />
      </div>

      {!escolha.clienteId && !somenteLeitura && (
        <p className="px-1 pt-2 text-apoio text-escuro-secundario">
          Escolha o cliente primeiro; as motos dele aparecem em seguida.
        </p>
      )}

      <FolhaDeBusca
        aberto={buscandoCliente}
        aoFechar={() => setBuscandoCliente(false)}
        titulo="Escolher cliente"
        placeholder="Nome ou telefone"
        buscar={buscarClientes}
        aoEscolher={(composta) => {
          const [id, nome] = composta.split('|')
          // Trocar de cliente invalida a moto: ela pertencia ao anterior.
          aoEscolher({
            clienteId: id,
            clienteNome: nome,
            motoId: undefined,
            motoPlaca: undefined,
            motoDescricao: undefined,
          })
          setBuscandoCliente(false)
        }}
        rotuloCriar="Cadastrar cliente novo"
        aoCriar={() => {
          setBuscandoCliente(false)
          setCriandoCliente(true)
        }}
        vazio={{
          titulo: 'Nenhum cliente ainda',
          descricao: 'Cadastre o cliente aqui mesmo, sem sair do orçamento.',
        }}
      />

      <FolhaDeBusca
        aberto={buscandoMoto}
        aoFechar={() => setBuscandoMoto(false)}
        titulo="Escolher moto"
        placeholder="Placa, marca ou modelo"
        autoCapitalize="characters"
        buscar={buscarMotos}
        aoEscolher={(composta) => {
          const [id, placa, descricao, km] = composta.split('|')
          aoEscolher({
            motoId: id,
            motoPlaca: placa,
            motoDescricao: descricao,
            motoKm: Number(km),
          })
          setBuscandoMoto(false)
        }}
        rotuloCriar="Cadastrar moto nova"
        aoCriar={() => {
          setBuscandoMoto(false)
          setCriandoMoto(true)
        }}
        vazio={{
          titulo: 'Este cliente não tem moto',
          descricao: 'Cadastre a moto dele aqui mesmo, sem sair do orçamento.',
        }}
      />

      <ModalClienteRapido
        aberto={criandoCliente}
        aoFechar={() => setCriandoCliente(false)}
        aoCriar={(cliente) => {
          aoEscolher({
            clienteId: cliente.id,
            clienteNome: cliente.nome,
            motoId: undefined,
            motoPlaca: undefined,
            motoDescricao: undefined,
          })
          setCriandoCliente(false)
          setCriandoMoto(true)
        }}
      />

      <ModalMotoRapida
        aberto={criandoMoto}
        aoFechar={() => setCriandoMoto(false)}
        clienteId={escolha.clienteId ?? ''}
        aoCriar={(moto) => {
          aoEscolher({
            motoId: moto.id,
            motoPlaca: moto.placa,
            motoDescricao: moto.descricao,
            motoKm: moto.km,
          })
          setCriandoMoto(false)
        }}
      />
    </>
  )
}

/** Só o essencial: no meio de um orçamento, nome e telefone bastam. */
function ModalClienteRapido({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoCriar: (cliente: { id: string; nome: string }) => void
}) {
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const cache = useQueryClient()
  const toast = useToast()

  const salvar = useMutation({
    mutationFn: () =>
      criarCliente({
        nome: nome.trim(),
        telefone: tel.replace(/\D/g, '') || null,
        email: null,
        cpf_cnpj: null,
        observacoes: null,
      }),
    onSuccess: (c) => {
      void cache.invalidateQueries({ queryKey: ['clientes'] })
      toast.sucesso('Cliente cadastrado.')
      setNome('')
      setTel('')
      aoCriar({ id: c.id, nome: c.nome })
    },
    onError: (e) => setErro(traduzirErro(e)),
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Cliente novo"
      rodape={
        <Botao
          largo
          carregando={salvar.isPending}
          onClick={() => {
            setErro(null)
            if (nome.trim().length < 2) return setErro('Informe o nome do cliente.')
            salvar.mutate()
          }}
        >
          Cadastrar e continuar
        </Botao>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Campo
          rotulo="Nome"
          obrigatorio
          autoFocus
          autoCapitalize="words"
          placeholder="Carlos da Silva"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Campo
          rotulo="Telefone"
          type="tel"
          inputMode="numeric"
          placeholder="(11) 98765-4321"
          dica="É por aqui que o orçamento vai no WhatsApp."
          value={tel}
          onChange={(e) => setTel(mascararTelefone(e.target.value))}
        />
        {erro && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  )
}

function ModalMotoRapida({
  aberto,
  aoFechar,
  clienteId,
  aoCriar,
}: {
  aberto: boolean
  aoFechar: () => void
  clienteId: string
  aoCriar: (moto: { id: string; placa: string; descricao: string; km: number }) => void
}) {
  const [placa, setPlaca] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [km, setKm] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const cache = useQueryClient()
  const toast = useToast()

  const salvar = useMutation({
    mutationFn: () =>
      criarMoto(clienteId, {
        placa: normalizarPlaca(placa),
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        ano: null,
        cor: null,
        chassi: null,
        km_atual: Number(km.replace(/\D/g, '')) || 0,
      }),
    onSuccess: (m) => {
      void cache.invalidateQueries({ queryKey: ['motos'] })
      toast.sucesso('Moto cadastrada.')
      setPlaca('')
      setMarca('')
      setModelo('')
      setKm('')
      aoCriar({
        id: m.id,
        placa: m.placa,
        descricao: [m.marca, m.modelo].filter(Boolean).join(' '),
        km: Number(m.km_atual),
      })
    },
    onError: (e) => setErro(traduzirErro(e)),
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Moto nova"
      rodape={
        <Botao
          largo
          carregando={salvar.isPending}
          onClick={() => {
            setErro(null)
            if (normalizarPlaca(placa).length !== 7) {
              return setErro('Placa incompleta. Use o formato ABC1234 ou ABC1D23.')
            }
            salvar.mutate()
          }}
        >
          Cadastrar e continuar
        </Botao>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Campo
          rotulo="Placa"
          obrigatorio
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABC1D23"
          className="uppercase tracking-wide"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Marca"
            autoCapitalize="words"
            placeholder="Honda"
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
          />
          <Campo
            rotulo="Modelo"
            autoCapitalize="words"
            placeholder="CG 160"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
          />
        </div>
        <Campo
          rotulo="Quilometragem"
          inputMode="numeric"
          placeholder="12000"
          value={km}
          onChange={(e) => setKm(e.target.value)}
        />
        {erro && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  )
}
