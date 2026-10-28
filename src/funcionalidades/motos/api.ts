import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import { normalizarPlaca } from '@/lib/formato'
import type { Cliente, Moto } from '@/tipos/banco'

export interface Proprietario {
  id: string
  cliente_id: string
  data_inicio: string
  data_fim: string | null
  /** Quando a posse foi registrada — decide se a troca ainda pode ser desfeita. */
  criado_em: string
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
    .select('id, cliente_id, data_inicio, data_fim, criado_em, clientes(id, nome, telefone)')
    .eq('moto_id', motoId)
    .order('data_inicio', { ascending: false })
    // Troca no mesmo dia: as duas posses começam na mesma data, e quem recebeu
    // a moto é o registro mais novo (mesmo desempate da migration 0037).
    .order('criado_em', { ascending: false })

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
      criado_em: l.criado_em,
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

/**
 * Passa a moto para outro cliente a partir de uma data (0087). O dono atual
 * fica no histórico como anterior; orçamentos, ordens e contas antigas
 * continuam no nome de quem pediu.
 */
export async function trocarDono(
  motoId: string,
  novoClienteId: string,
  data: string,
): Promise<{ anterior: string | null; novo: string; data: string }> {
  const { data: r, error } = await supabase.rpc('trocar_dono_da_moto', {
    p_moto_id: motoId,
    p_novo_cliente_id: novoClienteId,
    p_data: data,
  })
  if (error) throw error
  return r
}

/** Desfaz a última troca, enquanto nada foi feito na moto depois dela. */
export async function desfazerTrocaDeDono(motoId: string): Promise<{ dono: string | null }> {
  const { data, error } = await supabase.rpc('desfazer_troca_de_dono', { p_moto_id: motoId })
  if (error) throw error
  return data
}

export interface PendenciaDaMoto {
  tipo: 'orcamento' | 'ordem'
  numero: number
  cliente: string | null
}

/**
 * Orçamentos e ordens ainda em andamento nesta moto — para avisar antes de
 * trocar o dono. Eles continuam no nome de quem pediu, e está certo; o aviso é
 * para ninguém se surpreender.
 */
export async function pendenciasDaMoto(motoId: string): Promise<PendenciaDaMoto[]> {
  const [orcamentos, ordens] = await Promise.all([
    supabase
      .from('orcamentos')
      .select('numero, clientes(nome)')
      .eq('moto_id', motoId)
      .in('status', ['rascunho', 'enviado']),
    supabase
      .from('ordens_servico')
      .select('numero, clientes(nome)')
      .eq('moto_id', motoId)
      .in('status', ['aberta', 'em_andamento', 'pausada', 'aguardando_conferencia']),
  ])
  if (orcamentos.error) throw orcamentos.error
  if (ordens.error) throw ordens.error
  type Linha = { numero: number; clientes: { nome: string } | null }
  const comoPendencia = (tipo: PendenciaDaMoto['tipo']) => (l: Linha) => ({
    tipo,
    numero: l.numero,
    cliente: l.clientes?.nome ?? null,
  })
  return [
    ...((orcamentos.data ?? []) as unknown as Linha[]).map(comoPendencia('orcamento')),
    ...((ordens.data ?? []) as unknown as Linha[]).map(comoPendencia('ordem')),
  ]
}

export interface MotoComDono {
  id: string
  placa: string
  marca: string | null
  modelo: string | null
  km_atual: number
  dono: { id: string; nome: string } | null
}

/** A moto desta placa na oficina, com o dono de hoje — ou nulo se não existe. */
export async function motoPorPlaca(placa: string): Promise<MotoComDono | null> {
  const { data: moto, error } = await supabase
    .from('motos')
    .select('id, placa, marca, modelo, km_atual')
    .eq('placa', normalizarPlaca(placa))
    .maybeSingle()
  if (error) throw error
  if (!moto) return null
  const { data: posse, error: erroPosse } = await supabase
    .from('moto_proprietarios')
    .select('clientes(id, nome)')
    .eq('moto_id', moto.id)
    .is('data_fim', null)
    .maybeSingle()
  if (erroPosse) throw erroPosse
  const dono = (posse as unknown as { clientes: { id: string; nome: string } | null } | null)?.clientes
  return { ...moto, km_atual: Number(moto.km_atual), dono: dono ?? null }
}
