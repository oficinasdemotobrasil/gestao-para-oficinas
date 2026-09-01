import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Traduz o erro do banco para uma frase que diz o que fazer.
 *
 * Os códigos vêm do Postgres: 23505 é chave duplicada, 23503 é referência que
 * não existe, 42501 é permissão negada (nosso RLS recusando). Mostrar "23505"
 * na tela de uma oficina não ajuda ninguém.
 */
export function traduzirErro(erro: unknown): string {
  if (!erro) return 'Não foi possível concluir. Tente de novo.'

  const e = erro as Partial<PostgrestError> & { message?: string }
  const mensagem = e.message ?? ''
  const codigo = e.code ?? ''

  // Mensagens que os nossos próprios triggers levantam já vêm em português.
  if (mensagem.startsWith('Placa inválida')) return mensagem
  if (mensagem.includes('administrador ativo')) return mensagem
  if (mensagem.includes('Somente o administrador')) return mensagem
  if (mensagem.includes('outra oficina')) return mensagem

  if (codigo === '23505') {
    if (mensagem.includes('motos_placa_por_oficina')) {
      return 'Já existe uma moto com essa placa cadastrada na oficina.'
    }
    if (mensagem.includes('produtos_codigo_por_oficina')) {
      return 'Já existe um produto com esse código.'
    }
    if (mensagem.includes('usuarios_email_unico')) {
      return 'Este e-mail já está sendo usado por outro colaborador.'
    }
    if (mensagem.includes('moto_proprietarios_dono_atual')) {
      return 'Esta moto já tem um dono registrado.'
    }
    return 'Este registro já existe.'
  }

  if (codigo === '23503') {
    return 'Não foi possível salvar: um dos dados relacionados não existe mais. Atualize a tela e tente de novo.'
  }

  if (codigo === '23514') {
    return 'Algum valor está fora do permitido. Revise os campos e tente de novo.'
  }

  if (codigo === '42501' || mensagem.includes('row-level security')) {
    return 'Seu perfil não permite esta ação.'
  }

  if (mensagem.toLowerCase().includes('failed to fetch')) {
    return 'Sem conexão com a internet. Verifique o sinal e tente de novo.'
  }

  return 'Não foi possível concluir. Tente de novo em instantes.'
}

/**
 * Limpa o texto da busca antes de montar o filtro do PostgREST: vírgula e
 * parêntese fazem parte da sintaxe do .or() e quebrariam a consulta.
 */
export function limparBusca(texto: string): string {
  return texto.replace(/[,()%*\\]/g, '').trim()
}
