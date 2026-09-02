import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import type { ProdutoSemCusto } from '@/tipos/banco'

/** O custo só existe para o admin; para o vendedor a propriedade nem vem. */
export type ProdutoListado = ProdutoSemCusto & { preco_custo?: number }

/**
 * Duas fontes de leitura de propósito:
 * - admin lê a tabela produtos, que tem preco_custo e margem;
 * - vendedor lê a view vw_produtos, que não expõe custo nenhum.
 *
 * Isso não é firula de interface: RLS filtra linha, não coluna. Se o vendedor
 * lesse a tabela, o custo viria no JSON mesmo que a tela não o mostrasse.
 */
export async function listarProdutos(
  busca: string,
  verCusto: boolean,
): Promise<ProdutoListado[]> {
  const termo = limparBusca(busca)
  const filtro = termo ? `nome.ilike.%${termo}%,codigo.ilike.%${termo}%` : null

  // As duas origens têm colunas diferentes, então cada uma é montada no seu
  // próprio ramo — o tipo da consulta depende da tabela e não aceita união.
  const { data, error } = verCusto
    ? await (filtro
        ? supabase.from('produtos').select('*').or(filtro)
        : supabase.from('produtos').select('*')
      )
        .order('nome')
        .limit(200)
    : await (filtro
        ? supabase.from('vw_produtos').select('*').or(filtro)
        : supabase.from('vw_produtos').select('*')
      )
        .order('nome')
        .limit(200)

  if (error) throw error
  return (data ?? []) as ProdutoListado[]
}

export async function obterProduto(id: string): Promise<ProdutoListado | null> {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface DadosProduto {
  codigo: string | null
  nome: string
  descricao: string | null
  unidade: string
  preco_custo: number
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  ativo: boolean
}

export async function criarProduto(dados: DadosProduto) {
  const { data, error } = await supabase.from('produtos').insert(dados).select().single()
  if (error) throw error
  return data
}

export async function atualizarProduto(id: string, dados: DadosProduto) {
  // estoque_atual fica de fora de propósito: o saldo só muda por movimentação,
  // e o banco recusa escrita direta na coluna (migration 0024). Mandar aqui
  // derrubaria a edição inteira do produto por causa de um campo que a tela nem
  // deixa alterar.
  const { estoque_atual: _saldo, ...editaveis } = dados

  const { data, error } = await supabase
    .from('produtos')
    .update(editaveis)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function alternarAtivoProduto(id: string, ativo: boolean) {
  const { error } = await supabase.from('produtos').update({ ativo }).eq('id', id)
  if (error) throw error
}
