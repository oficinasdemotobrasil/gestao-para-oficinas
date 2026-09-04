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
  const { usuario } = useAuth()
  const perfil = usuario?.perfil ?? null

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
    verFinanceiro: ehAdmin,
  }
}

export const nomeDoPerfil: Record<'admin' | 'vendedor' | 'mecanico', string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
}
