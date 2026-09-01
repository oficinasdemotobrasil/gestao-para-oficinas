import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import { normalizarPlaca } from '@/lib/formato'
import type { Cliente, Moto } from '@/tipos/banco'

export interface Proprietario {
  id: string
  cliente_id: string
  data_inicio: string
  data_fim: string | null
  cliente: Pick<Cliente, 'id' | 'nome' | 'telefone'> | null
}

export async function listarMotos(busca: string): Promise<Moto[]> {
  let consulta = supabase.from('motos').select('*').order('placa')

  const termo = limparBusca(busca)
  if (termo) {
    // A busca principal é pela placa, então o texto digitado é normalizado do
    // mesmo jeito que o banco guarda: maiúsculo e sem hífen. Assim "abc-1d23"
    // encontra "ABC1D23".
    const placa = normalizarPlaca(termo)
    const filtros = [`marca.ilike.%${termo}%`, `modelo.ilike.%${termo}%`]
    if (placa) filtros.unshift(`placa.ilike.%${placa}%`)
    consulta = consulta.or(filtros.join(','))
  }

  const { data, error } = await consulta.limit(100)
  if (error) throw error
  return data ?? []
}

export async function obterMoto(id: string): Promise<Moto | null> {
  const { data, error } = await supabase.from('motos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/**
 * Histórico de donos da placa, do mais recente para o mais antigo.
 * É o que permite abrir uma moto que trocou de dono e continuar vendo tudo.
 */
export async function proprietariosDaMoto(motoId: string): Promise<Proprietario[]> {
  const { data, error } = await supabase
    .from('moto_proprietarios')
    .select('id, cliente_id, data_inicio, data_fim, clientes(id, nome, telefone)')
    .eq('moto_id', motoId)
    .order('data_inicio', { ascending: false })

  if (error) throw error

  return (data ?? []).map((linha) => {
    const l = linha as unknown as Omit<Proprietario, 'cliente'> & {
      clientes: Proprietario['cliente']
    }
    return {
      id: l.id,
      cliente_id: l.cliente_id,
      data_inicio: l.data_inicio,
      data_fim: l.data_fim,
      cliente: l.clientes,
    }
  })
}

export interface DadosMoto {
  placa: string
  marca: string | null
  modelo: string | null
  ano: number | null
  cor: string | null
  chassi: string | null
  km_atual: number
}

/**
 * A moto e o vínculo com o dono nascem juntos, dentro da mesma transação do
 * banco (função criar_moto_com_proprietario). Fazer os dois inserts daqui
 * deixaria moto órfã sempre que o segundo falhasse.
 */
export async function criarMoto(clienteId: string, dados: DadosMoto): Promise<Moto> {
  const { data, error } = await supabase.rpc('criar_moto_com_proprietario', {
    p_cliente_id: clienteId,
    p_placa: dados.placa,
    p_marca: dados.marca,
    p_modelo: dados.modelo,
    p_ano: dados.ano,
    p_cor: dados.cor,
    p_chassi: dados.chassi,
    p_km_atual: dados.km_atual,
  })
  if (error) throw error
  return data as Moto
}

export async function atualizarMoto(id: string, dados: DadosMoto): Promise<Moto> {
  const { data, error } = await supabase
    .from('motos')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Atualização rápida de quilometragem, feita na tela da moto. */
export async function atualizarKm(id: string, km: number): Promise<Moto> {
  const { data, error } = await supabase
    .from('motos')
    .update({ km_atual: km })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
