/**
 * Fotos e vistoria da OS (migration 0079).
 *
 * O envio tem três passos, nesta ordem, e a ordem é a regra de segurança:
 *
 * 1. A linha em os_fotos. É aqui que o banco confere os limites — 5 por OS e o
 *    do plano — e se a pessoa pode fotografar esta OS. Recusou, nada sobe.
 * 2. O arquivo no Storage. O bucket só aceita gravar no caminho de uma linha
 *    que a própria pessoa acabou de criar.
 * 3. A marca de "enviada". Sem ela, a linha deixa de contar depois de uma hora
 *    e a limpeza da plataforma a apaga.
 *
 * Se o passo 2 falhar, a linha é desfeita na hora, para a vaga não ficar presa.
 */
import { supabase } from '@/lib/supabase'
import { reduzirFoto, fotoParaDocumento } from '@/lib/foto'
import { dataHora } from '@/lib/formato'
import type { FotoDoDocumento } from '@/lib/pdfDocumento'
import type { Combustivel, MomentoDaFoto, OsFoto, OsVistoria } from '@/tipos/banco'

const BUCKET = 'fotos-os'
export const FOTOS_POR_ORDEM = 5

/** Uma hora: a página da OS fica aberta bem menos que isso. */
const VALIDADE_DO_ENDERECO = 60 * 60

export type FotoComEndereco = OsFoto & { endereco: string | null }

export const ROTULO_DO_MOMENTO: Record<MomentoDaFoto, string> = {
  entrada: 'Entrada',
  servico: 'Serviço',
  entrega: 'Entrega',
}

/** O momento que faz sentido para o status atual — a pessoa pode trocar. */
export function momentoSugerido(status: string): MomentoDaFoto {
  if (status === 'aberta') return 'entrada'
  if (status === 'finalizada' || status === 'entregue') return 'entrega'
  return 'servico'
}

export async function listarFotos(ordemId: string): Promise<FotoComEndereco[]> {
  const { data, error } = await supabase
    .from('os_fotos')
    .select('*')
    .eq('ordem_servico_id', ordemId)
    .eq('enviada', true)
    .order('criado_em')
  if (error) throw error
  const fotos = data ?? []
  if (fotos.length === 0) return []

  // O bucket é privado: cada foto ganha um endereço temporário. O pedido é
  // um só para todas, e não um por foto.
  const { data: enderecos } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      fotos.map((f) => f.caminho),
      VALIDADE_DO_ENDERECO,
    )
  const porCaminho = new Map((enderecos ?? []).map((e) => [e.path, e.signedUrl]))
  return fotos.map((f) => ({ ...f, endereco: porCaminho.get(f.caminho) ?? null }))
}

/** Erro de limite do plano: o app mostra o convite ao plano maior. */
export function ehLimiteDoPlano(erro: unknown): boolean {
  return (erro as { hint?: string } | null)?.hint === 'limite_de_fotos_do_plano'
}

export async function enviarFoto(dados: {
  oficinaId: string
  ordemId: string
  momento: MomentoDaFoto
  arquivo: Blob
}): Promise<void> {
  // Reduz antes de reservar: se a foto não abrir, não sobra linha nenhuma.
  const foto = await reduzirFoto(dados.arquivo)

  const id = crypto.randomUUID()
  const caminho = `${dados.oficinaId}/${dados.ordemId}/${id}.jpg`

  const { error: erroDaLinha } = await supabase.from('os_fotos').insert({
    id,
    ordem_servico_id: dados.ordemId,
    momento: dados.momento,
    caminho,
    bytes: foto.size,
  })
  if (erroDaLinha) throw erroDaLinha

  const { error: erroDoArquivo } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, foto, { contentType: 'image/jpeg', upsert: false })
  if (erroDoArquivo) {
    await supabase.from('os_fotos').delete().eq('id', id)
    throw erroDoArquivo
  }

  const { error: erroDaMarca } = await supabase
    .from('os_fotos')
    .update({ enviada: true })
    .eq('id', id)
  if (erroDaMarca) throw erroDaMarca
}

/** Só o dono da oficina (o banco recusa os demais). Arquivo primeiro, depois a linha. */
export async function apagarFoto(foto: OsFoto): Promise<void> {
  const { error: erroDoArquivo } = await supabase.storage.from(BUCKET).remove([foto.caminho])
  if (erroDoArquivo) throw erroDoArquivo
  const { error } = await supabase.from('os_fotos').delete().eq('id', foto.id)
  if (error) throw error
}

/** Baixa a foto para dentro do PDF da OS. */
export async function baixarFoto(caminho: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho)
  if (error || !data) throw error ?? new Error('Não consegui baixar a foto.')
  return data
}

export async function usoDeFotos(): Promise<{ emUso: number; limite: number | null }> {
  const { data, error } = await supabase.rpc('minhas_fotos_em_uso')
  if (error) throw error
  return { emUso: data?.em_uso ?? 0, limite: data?.limite ?? null }
}

// Vistoria ----------------------------------------------------------------------

export async function obterVistoria(ordemId: string): Promise<OsVistoria | null> {
  const { data, error } = await supabase
    .from('os_vistorias')
    .select('*')
    .eq('ordem_servico_id', ordemId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function salvarVistoria(dados: {
  ordemId: string
  itens: Record<string, 'ok' | 'avaria'>
  combustivel: Combustivel | null
  pertences: string | null
  observacoes: string | null
}): Promise<void> {
  const linha = {
    itens: dados.itens,
    combustivel: dados.combustivel,
    pertences: dados.pertences,
    observacoes: dados.observacoes,
  }
  const { data: existente } = await supabase
    .from('os_vistorias')
    .select('ordem_servico_id')
    .eq('ordem_servico_id', dados.ordemId)
    .maybeSingle()

  const { error } = existente
    ? await supabase.from('os_vistorias').update(linha).eq('ordem_servico_id', dados.ordemId)
    : await supabase.from('os_vistorias').insert({ ordem_servico_id: dados.ordemId, ...linha })
  if (error) throw error
}

/**
 * As fotos da OS prontas para o PDF: menores e já em texto (data URL).
 *
 * Feito quando a tela abre, e não no toque em "compartilhar": no iPhone o
 * compartilhamento só é aceito logo depois do toque, e baixar cinco fotos no
 * meio faria ele recusar.
 *
 * Uma foto que não baixar fica de fora; o PDF sai com as outras.
 */
export async function fotosParaDocumento(ordemId: string): Promise<FotoDoDocumento[]> {
  const { data, error } = await supabase
    .from('os_fotos')
    .select('*')
    .eq('ordem_servico_id', ordemId)
    .eq('enviada', true)
    .order('criado_em')
  if (error) throw error

  const prontas = await Promise.all(
    (data ?? []).map(async (f) => {
      try {
        const reduzida = await fotoParaDocumento(await baixarFoto(f.caminho))
        return { ...reduzida, legenda: `${ROTULO_DO_MOMENTO[f.momento]}\n${dataHora(f.criado_em)}` }
      } catch {
        return null
      }
    }),
  )
  return prontas.filter((f): f is FotoDoDocumento => f !== null)
}
