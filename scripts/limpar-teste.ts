/**
 * Remove uma oficina de teste e tudo que pende dela.
 *
 * A ordem importa por dois motivos:
 *
 * 1. Chave estrangeira: filho antes do pai, senão o 'restrict' recusa.
 * 2. Estoque: as movimentações são desfeitas da mais nova para a mais antiga.
 *    Apagar em bloco não funciona — ao remover uma entrada antiga com saídas
 *    ainda registradas depois dela, o saldo passa por baixo de zero e o gatilho
 *    recusa, com razão. Desfazer um extrato é como desempilhar: de cima.
 *
 * Foi por não fazer isso que os testes deixaram oficinas para trás no banco.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const ORDEM = [
  // os_itens e os_status_historico não entram: eles caem por cascata quando a
  // ordem é apagada. Apagados direto, esbarram no gatilho que impede mexer nos
  // itens de uma ordem já fechada — regra certa, no lugar errado para isto.
  // As contas vêm ANTES da ordem: a conta a receber aponta para a OS com
  // 'restrict', então apagar a ordem primeiro é recusado.
  'contas_receber',
  'contas_pagar',
  'ordens_servico',
  'orcamento_itens',
  'orcamentos',
  'notas_fiscais_entrada',
  'moto_proprietarios',
  'motos',
  'clientes',
  'produtos',
  'servicos',
  'usuarios',
] as const

export async function limparOficina(
  admin: SupabaseClient,
  oficinaId: string,
): Promise<string[]> {
  const problemas: string[] = []

  // 1. Extrato de estoque, do mais novo para o mais antigo, em passadas.
  //
  // Uma passada só não basta desde que a OS pode ser finalizada com saldo
  // negativo: o extrato fica com pares saída/devolução em que apagar a
  // devolução primeiro derrubaria o saldo abaixo de zero — e a trava recusa,
  // com razão. Apagando o que dá em cada passada, a ordem se resolve sozinha:
  // some a saída, o saldo sobe, e na volta a devolução já pode sair.
  const { data: movimentacoes } = await admin
    .from('movimentacoes_estoque')
    .select('id')
    .eq('oficina_id', oficinaId)
    .order('criado_em', { ascending: false })

  let restantes = (movimentacoes ?? []).map((m) => m.id)

  while (restantes.length > 0) {
    const teimosas: string[] = []
    const erros = new Map<string, string>()

    for (const id of restantes) {
      const { error } = await admin.from('movimentacoes_estoque').delete().eq('id', id)
      if (error) {
        teimosas.push(id)
        erros.set(id, error.message)
      }
    }

    // Nenhuma saiu nesta passada: insistir seria laço infinito.
    if (teimosas.length === restantes.length) {
      for (const id of teimosas) problemas.push(`movimentação ${id}: ${erros.get(id)}`)
      break
    }
    restantes = teimosas
  }

  // 2. O resto, filho antes do pai.
  for (const tabela of ORDEM) {
    const { error } = await admin.from(tabela).delete().eq('oficina_id', oficinaId)
    if (error) problemas.push(`${tabela}: ${error.message}`)
  }

  const { error } = await admin.from('oficinas').delete().eq('id', oficinaId)
  if (error) problemas.push(`oficina: ${error.message}`)

  return problemas
}

/** Apaga as contas de teste do Auth, reconhecidas pelo prefixo do e-mail. */
export async function limparContasDeTeste(
  admin: SupabaseClient,
  prefixos: readonly string[],
): Promise<string[]> {
  const problemas: string[] = []
  const { data } = await admin.auth.admin.listUsers()

  for (const usuario of data.users) {
    if (!usuario.email) continue
    if (!prefixos.some((p) => usuario.email!.startsWith(p))) continue
    const { error } = await admin.auth.admin.deleteUser(usuario.id)
    if (error) problemas.push(`auth ${usuario.email}: ${error.message}`)
  }

  return problemas
}
