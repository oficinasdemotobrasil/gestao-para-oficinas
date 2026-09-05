import { useAuth } from './ProvedorAuth'

/**
 * O que cada perfil pode fazer, em um lugar só.
 *
 * Isto é conveniência de interface: esconder um botão que a pessoa não pode
 * usar. A regra que vale é a do banco — as políticas de RLS em
 * /supabase/migrations. Nada aqui protege dado nenhum; se estas linhas
 * sumissem, o servidor continuaria recusando o que tem que recusar.
 */
export function usePermissoes() {
  const { usuario, oficina } = useAuth()
  const perfil = usuario?.perfil ?? null

  // O plano decide o que a oficina contratou; o perfil decide quem, dentro
  // dela, alcança o quê. São perguntas diferentes e por isso ficam separadas:
  // esconder o financeiro de um plano que não o tem não é permissão de pessoa.
  const temFinanceiro = oficina?.plano === 'completo'

  const ehAdmin = perfil === 'admin'
  const ehVendedor = perfil === 'vendedor'
  const ehMecanico = perfil === 'mecanico'
  const ehAtendimento = ehAdmin || ehVendedor

  return {
    perfil,
    ehAdmin,
    ehVendedor,
    ehMecanico,

    verClientes: ehAtendimento,
    editarClientes: ehAtendimento,
    apagarClientes: ehAdmin,

    verMotos: ehAtendimento,
    editarMotos: ehAtendimento,

    verOrcamentos: ehAtendimento,
    editarOrcamentos: ehAtendimento,

    // O mecânico também abre ordem de serviço: é o trabalho dele. Quais ele
    // enxerga quem decide é o RLS — só as que estão no nome dele.
    verOrdens: true,
    /** A lista da oficina inteira. O mecânico só tem as dele, na tela inicial. */
    verOrdensDaOficina: ehAtendimento,
    /** Atribuir, conferir, finalizar, cancelar e cobrar. */
    gerenciarOrdens: ehAtendimento,

    verCatalogo: ehAtendimento,
    /** Só o admin enxerga preço de custo e margem. */
    verCusto: ehAdmin,
    editarCatalogo: ehAdmin,

    verColaboradores: ehAdmin,
    editarColaboradores: ehAdmin,

    verConfiguracoes: ehAdmin,
    /** O painel é de quem cuida do dinheiro, e existe em qualquer plano. */
    verPainel: ehAdmin,
    /** Contas a receber e a pagar: perfil E plano. */
    verFinanceiro: ehAdmin && temFinanceiro,
    /** Para a tela poder dizer "seu plano não inclui" em vez de sumir sem explicar. */
    financeiroNoPlano: temFinanceiro,
  }
}

export const nomeDoPerfil: Record<'admin' | 'vendedor' | 'mecanico', string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
}
