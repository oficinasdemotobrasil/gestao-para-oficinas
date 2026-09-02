import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Reconhece o erro de sessão vencida.
 *
 * O token do Supabase vale uma hora e se renova sozinho — mas só com o app em
 * primeiro plano. Na oficina o celular fica no bolso e volta depois: o token
 * venceu, as listas continuam na tela porque vêm do cache, e só a gravação
 * falha. Sem tratar isso, a pessoa vê "não foi possível concluir" e acha que
 * perdeu o que digitou.
 */
export function ehSessaoExpirada(erro: unknown): boolean {
  if (!erro) return false
  const e = erro as { message?: string; code?: string; status?: number }
  const mensagem = (e.message ?? '').toLowerCase()
  return (
    e.status === 401 ||
    e.code === 'PGRST301' ||
    e.code === '401' ||
    mensagem.includes('jwt expired') ||
    mensagem.includes('jwt is expired') ||
    mensagem.includes('token is expired') ||
    mensagem.includes('invalid claim') ||
    mensagem.includes('refresh_token_not_found')
  )
}

/**
 * Padrões das mensagens internas do Postgres, sempre em inglês.
 *
 * Servem para separar o que é ruído de banco do que é recado para gente. As
 * nossas funções levantam exceção com o texto já escrito em português, pensado
 * para quem está na oficina — "Não há estoque suficiente de Pastilha de freio:
 * tem 13 un, você pediu 500." Essa frase é melhor do que qualquer coisa que eu
 * escrevesse aqui, e antes ela era jogada fora e trocada por um genérico.
 */
const RUIDO_DO_POSTGRES = [
  'violates check constraint',
  'violates foreign key constraint',
  'violates not-null constraint',
  'violates unique constraint',
  'violates row-level security policy',
  'duplicate key value',
  'null value in column',
  'permission denied',
  'could not find the function',
  'invalid input syntax',
]

/**
 * Traduz o erro do banco para uma frase que diz o que fazer.
 *
 * A regra: mensagem escrita por nós passa direto; ruído do Postgres vira uma
 * frase amigável a partir do código. 23505 é chave duplicada, 23503 é
 * referência que não existe, 42501 é permissão negada.
 */
export function traduzirErro(erro: unknown): string {
  if (!erro) return 'Não foi possível concluir. Tente de novo.'

  if (ehSessaoExpirada(erro)) {
    return 'Sua sessão expirou por inatividade. Entre de novo — nada do que você digitou foi perdido no servidor.'
  }

  const e = erro as Partial<PostgrestError> & { message?: string }
  const mensagem = (e.message ?? '').trim()
  const codigo = e.code ?? ''
  const emIngles = mensagem.toLowerCase()

  if (emIngles.includes('failed to fetch') || emIngles.includes('networkerror')) {
    return 'Sem conexão com a internet. Verifique o sinal e tente de novo.'
  }

  const ehRuido = RUIDO_DO_POSTGRES.some((p) => emIngles.includes(p))

  // Mensagem nossa, já em português: ela sabe explicar melhor do que qualquer
  // texto genérico. Vai inteira para a tela.
  if (!ehRuido && mensagem && !/^[A-Z_]+$/.test(mensagem)) {
    return mensagem.endsWith('.') ? mensagem : `${mensagem}.`
  }

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
    if (mensagem.includes('orcamentos_oficina_id_numero')) {
      return 'Já existe um orçamento com esse número. Tente salvar de novo.'
    }
    return 'Este registro já existe.'
  }

  if (codigo === '23503') {
    return 'Não foi possível salvar: um dos dados relacionados não existe mais. Atualize a tela e tente de novo.'
  }

  if (codigo === '23502') {
    return 'Faltou preencher um campo obrigatório. Revise o formulário e tente de novo.'
  }

  if (codigo === '23514') {
    return 'Algum valor está fora do permitido. Revise os campos e tente de novo.'
  }

  if (codigo === '42501' || emIngles.includes('row-level security')) {
    return 'Seu perfil não permite esta ação.'
  }

  // Erro que eu não previ. Em vez de esconder atrás de uma frase genérica — que
  // não ajuda nem quem está na oficina nem quem vai consertar —, o texto leva a
  // pista técnica no fim e o erro inteiro vai para o console.
  console.error('[erro não previsto]', erro)

  const pista = [codigo, mensagem].filter(Boolean).join(': ').slice(0, 120)
  return pista
    ? `Não foi possível concluir. Mostre esta mensagem ao suporte: ${pista}`
    : 'Não foi possível concluir. Tente de novo em instantes.'
}

/**
 * Limpa o texto da busca antes de montar o filtro do PostgREST: vírgula e
 * parêntese fazem parte da sintaxe do .or() e quebrariam a consulta.
 */
export function limparBusca(texto: string): string {
  return texto.replace(/[,()%*\\]/g, '').trim()
}
