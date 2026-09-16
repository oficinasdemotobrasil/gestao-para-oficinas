import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { QrCode, CircleCheck } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Campo, Selecao, Interruptor } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { useAuth } from '@/auth/ProvedorAuth'
import type { FormaPagamento } from '@/tipos/banco'
import { FORMAS } from '@/funcionalidades/financeiro/api'
import { ItensDaNotaEntrada } from '../ItensDaNotaEntrada'
import { CamposFiscais, fiscalVazio, type DadosFiscais } from '../CamposFiscais'
import { LeitorQrCode } from '../LeitorQrCode'
import { ImportarXml } from '../ImportarXml'
import type { NotaDoXml } from '../lerXmlDaNota'
import { chaveValida, lerChave, chaveDoConteudoDoQr } from '../chaveDeAcesso'
import { salvarNotaEntrada, type ItemEntradaEmEdicao } from '../api'

const hoje = () => new Date().toISOString().slice(0, 10)

export function EditorNotaEntrada() {
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const { oficina } = useAuth()

  const [numero, setNumero] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [dataEmissao, setDataEmissao] = useState(hoje())
  const [chaveAcesso, setChaveAcesso] = useState('')
  const [erroChave, setErroChave] = useState<string | null>(null)
  const [escaneando, setEscaneando] = useState(false)
  const [mostrarCampoDaChave, setMostrarCampoDaChave] = useState(false)
  const [itens, setItens] = useState<ItemEntradaEmEdicao[]>([])
  const [fiscal, setFiscal] = useState<DadosFiscais>(fiscalVazio)
  const [categoria, setCategoria] = useState('Fornecedor')
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [pagoAgora, setPagoAgora] = useState(false)
  const [parcelas, setParcelas] = useState('1')
  const [vencimento, setVencimento] = useState(hoje())
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const total = itens.reduce((acc, i) => acc + i.quantidade * (i.custo_unitario ?? 0), 0)

  /**
   * A chave de acesso já carrega o número da nota dentro dela — se o campo
   * de número ainda está vazio, preenche sozinho. Se a pessoa já digitou um
   * número diferente (a nota impressa às vezes diverge do sistema do
   * fornecedor), o que ela digitou vale mais que o que foi lido.
   *
   * Não valida a cada tecla: um campo de 44 dígitos passa 43 teclas inteiras
   * "errado" no meio do caminho. O erro só aparece quando já tem alguma coisa
   * escrita e ainda assim não fechou em 44 — ou seja, quando parece que a
   * pessoa parou de digitar sem terminar.
   */
  function digitarChave(digitado: string) {
    const digitos = digitado.replace(/\D/g, '').slice(0, 44)
    setChaveAcesso(digitos)
    if (digitos.length === 0 || digitos.length === 44) {
      setErroChave(null)
    }
    if (chaveValida(digitos)) {
      const lida = lerChave(digitos)
      if (lida && !numero.trim()) setNumero(lida.numero)
    }
  }

  /** Usado pelo QR: a leitura chega pronta, de uma vez — aí sim, erra ou acerta na hora. */
  function aplicarChave(digitos: string) {
    if (!chaveValida(digitos)) {
      setErroChave('Isso não parece uma chave de acesso — ela tem 44 números.')
      return
    }
    digitarChave(digitos)
    setErroChave(null)
  }

  /**
   * O XML preenche tudo o que ele sabe — e só o que ele sabe. A parte
   * financeira (parcelas, vencimento, forma) fica como está: essa informação
   * não existe na nota, é combinado entre a oficina e o fornecedor.
   */
  function aoImportarXml(nota: NotaDoXml, itensProntos: ItemEntradaEmEdicao[]) {
    if (nota.chaveAcesso) aplicarChave(nota.chaveAcesso)
    if (nota.numero) setNumero(nota.numero)
    if (nota.dataEmissao) setDataEmissao(nota.dataEmissao)
    if (nota.fornecedorNome) setFornecedor(nota.fornecedorNome)
    setFiscal((atual) => ({
      ...atual,
      natureza_operacao: nota.naturezaOperacao ?? atual.natureza_operacao,
      // O CFOP do cabeçalho é o do primeiro item: na compra de mercadoria a
      // nota inteira costuma ter um só, e quando não tem, o que vale para o
      // lançamento é o predominante.
      cfop: nota.itens[0]?.cfop ?? atual.cfop,
      base_calculo_icms: nota.baseCalculoIcms != null ? String(nota.baseCalculoIcms).replace('.', ',') : atual.base_calculo_icms,
      valor_icms: nota.valorIcms != null ? String(nota.valorIcms).replace('.', ',') : atual.valor_icms,
    }))
    setItens(itensProntos)
    setErroGeral(null)
  }

  function aoLerQr(conteudo: string) {
    setEscaneando(false)
    const chave = chaveDoConteudoDoQr(conteudo) ?? (chaveValida(conteudo) ? conteudo : null)
    if (!chave) {
      setErroChave('O QR code lido não tinha uma chave de acesso reconhecível. Tente digitar manualmente.')
      return
    }
    aplicarChave(chave)
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarNotaEntrada({
        numero: numero.trim(),
        fornecedor: fornecedor.trim() || null,
        data_emissao: dataEmissao,
        valor_total: total,
        arquivo_url: null,
        chave_acesso: chaveValida(chaveAcesso) ? chaveAcesso : null,
        itens,
        natureza_operacao: fiscal.natureza_operacao || null,
        cfop: fiscal.cfop || null,
        base_calculo_icms: fiscal.base_calculo_icms ? paraNumero(fiscal.base_calculo_icms) : null,
        valor_icms: fiscal.valor_icms ? paraNumero(fiscal.valor_icms) : null,
        valor_iss: fiscal.valor_iss ? paraNumero(fiscal.valor_iss) : null,
        parcelas: pagoAgora ? 1 : Number(parcelas) || 1,
        primeiro_vencimento: pagoAgora ? dataEmissao : vencimento,
        categoria: categoria || null,
        forma_pagamento: forma || null,
        pago_agora: pagoAgora,
      }),
    onSuccess: (novoId) => {
      void cache.invalidateQueries({ queryKey: ['notas-entrada'] })
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      void cache.invalidateQueries({ queryKey: ['contas-pagar'] })
      toast.sucesso('Nota lançada. O estoque e o Financeiro já foram atualizados.')
      navegar(`/notas-fiscais/entrada/${novoId}`, { replace: true })
    },
    onError: (e) => setErroGeral(traduzirErro(e)),
  })

  function enviar() {
    setErroGeral(null)
    if (chaveAcesso.length > 0 && !chaveValida(chaveAcesso)) {
      return setErroGeral('A chave de acesso ficou incompleta. Termine de digitar ou apague o que foi colado.')
    }
    if (!numero.trim()) return setErroGeral('Informe o número da nota.')
    if (itens.length === 0) return setErroGeral('Adicione pelo menos uma peça.')
    salvar.mutate()
  }

  return (
    <Tela comRodapeFixo>
      <CabecalhoInterno titulo="Nova nota de entrada" contexto="Compra de fornecedor" />

      {/* O XML vem primeiro de propósito: é o único caminho que traz a nota
          inteira. O QR e a digitação trazem só a identificação. */}
      <div className="flex flex-col gap-2">
        <ImportarXml
          aoImportar={aoImportarXml}
          aoResolverItem={(item) => setItens((atuais) => [...atuais, item])}
        />

        <button
          type="button"
          onClick={() => setEscaneando(true)}
          className="flex min-h-toque items-center justify-center gap-2 rounded-card bg-acento-suave px-4 text-em-superficie active:opacity-80"
        >
          <QrCode aria-hidden size={20} />
          <span className="text-corpo font-semibold">Ou ler o QR code (só a identificação)</span>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
        {(chaveAcesso || erroChave || mostrarCampoDaChave) && (
          <div>
            <Campo
              rotulo="Chave de acesso"
              dica="Os 44 números da nota. Preenche sozinho ao ler o QR, ou cole aqui."
              erro={erroChave ?? undefined}
              value={chaveAcesso}
              onChange={(e) => digitarChave(e.target.value)}
              onBlur={() => {
                if (chaveAcesso.length > 0 && chaveAcesso.length < 44) {
                  setErroChave(`Faltam ${44 - chaveAcesso.length} números.`)
                }
              }}
            />
            {chaveValida(chaveAcesso) && (
              <p className="flex items-center gap-1.5 pt-1.5 text-apoio text-sucesso-forte">
                <CircleCheck aria-hidden size={14} />
                Chave reconhecida
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Número da nota"
            obrigatorio
            placeholder="9001"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <Campo
            rotulo="Data de emissão"
            type="date"
            value={dataEmissao}
            onChange={(e) => setDataEmissao(e.target.value)}
          />
        </div>
        <Campo
          rotulo="Fornecedor"
          placeholder="Distribuidora de Peças Rio"
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
        />
        {!chaveAcesso && !erroChave && !mostrarCampoDaChave && (
          <button
            type="button"
            onClick={() => setMostrarCampoDaChave(true)}
            className="self-start text-apoio font-medium text-em-superficie-2 underline"
          >
            Tenho a chave de acesso, mas não vou escanear
          </button>
        )}
      </div>

      <TituloSecao>Peças</TituloSecao>
      <ItensDaNotaEntrada itens={itens} aoMudar={setItens} />

      <TituloSecao>Financeiro</TituloSecao>
      <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
        <Interruptor
          rotulo="Já paguei"
          descricao="A conta nasce quitada, sem entrar na fila de vencimento."
          marcado={pagoAgora}
          aoMudar={setPagoAgora}
        />

        {!pagoAgora && (
          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="Em quantas vezes"
              inputMode="numeric"
              value={parcelas}
              onChange={(e) => setParcelas(e.target.value.replace(/\D/g, ''))}
            />
            <Campo
              rotulo="Primeiro vencimento"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {(oficina?.categorias_despesa ?? ['Fornecedor']).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Selecao>
          <Selecao
            rotulo="Forma de pagamento"
            value={forma}
            onChange={(e) => setForma(e.target.value as FormaPagamento | '')}
          >
            <option value="">Não informar</option>
            {FORMAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </Selecao>
        </div>
      </div>

      <TituloSecao>Dados fiscais</TituloSecao>
      <CamposFiscais dados={fiscal} aoMudar={setFiscal} comIss={false} />

      {erroGeral && (
        <p role="alert" className="mt-4 rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
          {erroGeral}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-[calc(var(--altura-tabbar)+env(safe-area-inset-bottom))] z-30 border-t border-borda-em-fundo bg-fundo px-5 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-rotulo text-em-fundo-2">
              {itens.length} {itens.length === 1 ? 'peça' : 'peças'}
            </span>
            <span className="text-titulo text-acento-forte">{moeda(total)}</span>
          </div>
          <Botao largo carregando={salvar.isPending} onClick={enviar}>
            Lançar nota
          </Botao>
        </div>
      </div>

      <LeitorQrCode aberto={escaneando} aoFechar={() => setEscaneando(false)} aoLer={aoLerQr} />
    </Tela>
  )
}
