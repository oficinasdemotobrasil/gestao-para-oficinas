/**
 * Os preços do plano único, como a tela mostra (migration 0082).
 *
 * O valor vem do banco — aqui não há número de preço nenhum. O que mora aqui
 * é o jeito de DIZER o preço: o nome do período, quanto sai por mês e quanto
 * economiza. Fica num lugar só para a tela de assinatura e a página de vendas
 * dizerem exatamente a mesma coisa.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PeriodoDePagamento, Preco } from '@/tipos/banco'

export const ROTULO_DO_PERIODO: Record<PeriodoDePagamento, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
  vitalicio: 'Vitalício',
}

/** "por mês", "a cada 3 meses"… — o que o valor cheio compra. */
export const SUFIXO_DO_PERIODO: Record<PeriodoDePagamento, string> = {
  mensal: 'por mês',
  trimestral: 'a cada 3 meses',
  anual: 'por ano',
  vitalicio: 'uma vez só',
}

/**
 * O período que chega pelo endereço (`?periodo=anual`, `?assinar=anual`),
 * vindo do botão de compra da página de vendas. Qualquer outra coisa vira
 * nulo: endereço é texto que qualquer um digita.
 */
export function periodoDoEndereco(valor: string | null): PeriodoDePagamento | null {
  return valor && valor in ROTULO_DO_PERIODO ? (valor as PeriodoDePagamento) : null
}

/** O período em destaque: é a melhor oferta recorrente, e é a que se quer vender. */
export const PERIODO_EM_DESTAQUE: PeriodoDePagamento = 'anual'

/** Quanto o período sai por mês. Nulo no vitalício, que não tem mês. */
export function porMes(preco: Preco): number | null {
  if (!preco.meses) return null
  return Math.round((Number(preco.valor) / preco.meses) * 100) / 100
}

/**
 * Quanto se economiza em relação a pagar mês a mês pelo mesmo tempo. Zero no
 * mensal e no vitalício (que não se compara assim).
 */
export function economia(preco: Preco, mensal: Preco | undefined): number {
  if (!mensal || !preco.meses || preco.meses <= 1) return 0
  return Math.max(Math.round((Number(mensal.valor) * preco.meses - Number(preco.valor)) * 100) / 100, 0)
}

export function usePrecos() {
  return useQuery({
    queryKey: ['precos'],
    // Preço muda raramente; sem pressa de reler.
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('precos').select('*').eq('ativo', true).order('ordem')
      if (error) throw error
      return (data ?? []) as Preco[]
    },
  })
}

/** "Restam X vagas" — o número real, do banco. */
export function useVagasVitalicias() {
  return useQuery({
    queryKey: ['vagas-vitalicias'],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vagas_vitalicias_restantes')
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

/** As opções de parcelamento, com a taxa do cartão já no total. */
export function useParcelas(periodo: PeriodoDePagamento | null) {
  return useQuery({
    queryKey: ['parcelas', periodo],
    enabled: Boolean(periodo),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('simular_parcelas', { p_periodo: periodo! })
      if (error) throw error
      return (data ?? []).map((p) => ({
        parcelas: Number(p.parcelas),
        total: Number(p.total),
        valorParcela: Number(p.valor_parcela),
      }))
    },
  })
}

/**
 * Tudo o que o plano inclui, em grupos — o que a página de vendas e a tela de
 * assinatura mostram.
 *
 * Fica no código, e não na coluna `beneficios` dos planos, porque descreve o
 * que o SISTEMA faz: acompanha a versão. Um recurso que sai ou muda de nome
 * muda aqui, no mesmo commit em que mudou na tela. Os textos dizem só o que
 * existe hoje — nada de "em breve".
 */
export const RECURSOS_DO_PLANO: { grupo: string; itens: string[] }[] = [
  {
    grupo: 'Atendimento',
    itens: [
      'Orçamento no celular, enviado pelo WhatsApp ou em PDF',
      'Texto do orçamento escrito pela inteligência artificial',
      'Busca por placa, cliente ou número da OS',
      'Ficha da moto com tudo o que já foi feito e a garantia',
    ],
  },
  {
    grupo: 'Oficina',
    itens: [
      'Ordem de serviço do orçamento à entrega, com responsável',
      'Relógio de tempo do mecânico em cada serviço',
      'Fotos e vistoria de entrada da moto',
      'PDF da OS com vistoria e fotos para o cliente',
    ],
  },
  {
    grupo: 'Estoque',
    itens: [
      'Catálogo de peças e serviços com preço e margem',
      'Entrada de nota fiscal pelo XML ou pelo QR code',
      'Peça reservada para a OS e aviso de repor',
    ],
  },
  {
    grupo: 'Dinheiro',
    itens: [
      'Contas a receber e a pagar, com parcelamento',
      'Cobrança por PIX com QR code e copia e cola',
      'Quem está devendo e quem sumiu, com mensagem pronta',
      'Painel com faturamento, conversão e ticket médio',
      'Comissão de quem indica cliente',
    ],
  },
  {
    grupo: 'Equipe e segurança',
    itens: [
      'Até 5 acessos: dono, balcão e mecânico',
      'O mecânico não vê preço nem dinheiro',
      'Funciona no celular e instala como aplicativo',
      'Todos os seus dados em planilha, quando quiser',
    ],
  },
]
