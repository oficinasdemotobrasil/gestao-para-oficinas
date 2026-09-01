import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import type { Cliente, Moto } from '@/tipos/banco'

/**
 * Nenhuma consulta daqui filtra por oficina_id: quem faz isso é o RLS, no banco.
 * Filtrar aqui também só daria a falsa impressão de que a segurança é do app.
 */

export async function listarClientes(busca: string): Promise<Cliente[]> {
  let consulta = supabase.from('clientes').select('*').order('nome')

  const termo = limparBusca(busca)
  if (termo) {
    // Busca por nome ou por telefone: no balcão, ora se sabe um, ora o outro.
    const digitos = termo.replace(/\D/g, '')
    const filtros = [`nome.ilike.%${termo}%`]
    if (digitos) filtros.push(`telefone.ilike.%${digitos}%`)
    consulta = consulta.or(filtros.join(','))
  }

  const { data, error } = await consulta.limit(100)
  if (error) throw error
  return data ?? []
}

export async function obterCliente(id: string): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface DadosCliente {
  nome: string
  telefone: string | null
  email: string | null
  cpf_cnpj: string | null
  observacoes: string | null
}

export async function criarCliente(dados: DadosCliente): Promise<Cliente> {
  const { data, error } = await supabase
    .from('clientes')
    .insert(dados)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarCliente(id: string, dados: DadosCliente): Promise<Cliente> {
  const { data, error } = await supabase
    .from('clientes')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Motos que o cliente tem hoje. O vínculo mora em moto_proprietarios porque a
 * moto é independente do dono: quando ela troca de mãos, o histórico dela fica.
 */
export async function motosDoCliente(clienteId: string): Promise<Moto[]> {
  const { data, error } = await supabase
    .from('moto_proprietarios')
    .select('motos(*)')
    .eq('cliente_id', clienteId)
    .is('data_fim', null)

  if (error) throw error

  return (data ?? [])
    .flatMap((linha) => (linha as unknown as { motos: Moto | null }).motos ?? [])
    .sort((a, b) => a.placa.localeCompare(b.placa))
}
