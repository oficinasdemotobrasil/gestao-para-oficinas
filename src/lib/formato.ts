import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** R$ 1.234,56 */
export function moeda(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(n) ? n : 0)
}

/** 1.234,5 — para quantidade de estoque, que pode ser fracionada. */
export function quantidade(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0)
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(
    Number.isFinite(n) ? n : 0,
  )
}

/** 15,21% — o ponto decimal do banco não é como se escreve preço no Brasil. */
export function porcentagem(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0)
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  )}%`
}

/** 31/12/2025 */
export function data(valor: string | Date | null | undefined): string {
  if (!valor) return '—'
  const d = typeof valor === 'string' ? parseISO(valor) : valor
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

/** 31/12/2025 às 14:30 */
export function dataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—'
  const d = typeof valor === 'string' ? parseISO(valor) : valor
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

/** 12.000 km */
export function quilometragem(km: number | null | undefined): string {
  if (km == null) return '—'
  return `${new Intl.NumberFormat('pt-BR').format(km)} km`
}

/** (11) 98765-4321 — aceita 10 ou 11 dígitos, devolve o que veio se não bater. */
export function telefone(valor: string | null | undefined): string {
  if (!valor) return '—'
  const d = valor.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return valor
}

/** Máscara aplicada enquanto a pessoa digita o telefone. */
export function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** ABC1D23 — maiúscula, sem hífen nem espaço. O banco normaliza de novo. */
export function normalizarPlaca(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7)
}

/** ABC-1D23, só para exibir. */
export function exibirPlaca(placa: string | null | undefined): string {
  if (!placa) return '—'
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa
}

/** 123.456.789-00 ou 12.345.678/0001-00, conforme a quantidade de dígitos. */
export function cpfCnpj(valor: string | null | undefined): string {
  if (!valor) return '—'
  const d = valor.replace(/\D/g, '')
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  return valor
}

/** Primeiro nome, para a saudação do cabeçalho. */
export function primeiroNome(nome: string | null | undefined): string {
  if (!nome) return ''
  return nome.trim().split(/\s+/)[0]
}
