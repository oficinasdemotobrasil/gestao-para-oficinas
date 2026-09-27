/**
 * As telas do GIRO desenhadas em HTML, para a página do produto.
 *
 * Por que não foto de tela: imagem raster fica mole no celular retina, pesa
 * alguns megabytes no primeiro carregamento — justo na página que precisa abrir
 * rápido — e envelhece calada quando a tela de verdade muda. Aqui o desenho usa
 * os mesmos tokens do aplicativo, então a cor da marca e o tema acompanham.
 *
 * O que está escrito nelas é conteúdo de demonstração, e está escrito à mão de
 * propósito: são números plausíveis de uma oficina de bairro, não os números de
 * nenhum cliente. Nada aqui lê o banco.
 */
import type { ReactNode } from 'react'
import { Check, QrCode, Search, Send, Wrench } from 'lucide-react'

/** O aparelho: moldura escura, tela arredondada, alto-falante. */
export function Celular({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-[248px] shrink-0 rounded-[2rem] border-[6px] border-[#2a2a2e] bg-[#0b0b0c] p-1 shadow-2xl">
      <div className="relative overflow-hidden rounded-[1.6rem] bg-fundo">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-12 rounded-full bg-[#2a2a2e]" />
        </div>
        <div className="px-3 pb-4 pt-3">{children}</div>
      </div>
    </div>
  )
}

function Linha({ texto, valor }: { texto: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <span className="truncate text-[9px] text-em-superficie-2">{texto}</span>
      <span className="shrink-0 text-[9px] font-semibold text-em-superficie">{valor}</span>
    </div>
  )
}

function Cartao({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-superficie p-3">{children}</div>
}

/** 1. O orçamento montado no balcão, com o cliente na frente. */
export function TelaOrcamento() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-em-fundo">Orçamento nº 128</p>
      <Cartao>
        <p className="text-[10px] font-semibold text-em-superficie">Marcos Andrade</p>
        <p className="text-[9px] text-em-superficie-2">Honda CG 160 · RFC4B12</p>
        <div className="mt-2 border-t border-borda-em-superficie pt-1">
          <Linha texto="Revisão completa" valor="R$ 180,00" />
          <Linha texto="Óleo 10W30 · 2 un" valor="R$ 90,00" />
          <Linha texto="Filtro de óleo" valor="R$ 32,00" />
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t border-borda-em-superficie pt-2">
          <span className="text-[9px] text-em-superficie-2">Total</span>
          <span className="text-[13px] font-bold text-em-superficie">R$ 302,00</span>
        </div>
      </Cartao>
      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-acento py-2">
        <Send aria-hidden size={11} className="text-em-superficie" />
        <span className="text-[10px] font-semibold text-em-superficie">Enviar no WhatsApp</span>
      </div>
    </div>
  )
}

/** 2. A ordem em andamento, com quem está na bancada. */
export function TelaOrdem() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-em-fundo">OS nº 0091</p>
        <span className="rounded-full bg-acento-suave px-2 py-0.5 text-[8px] font-semibold text-em-superficie">
          Em andamento
        </span>
      </div>
      <Cartao>
        <div className="flex items-center gap-1.5">
          <Wrench aria-hidden size={11} className="text-em-superficie-2" />
          <span className="text-[9px] text-em-superficie-2">Jorge · 1h 20min na bancada</span>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {[
            ['Troca de óleo e filtro', true],
            ['Regulagem de freio', true],
            ['Revisão elétrica', false],
          ].map(([t, feito]) => (
            <div key={t as string} className="flex items-center gap-1.5">
              <span
                className={`flex h-3 w-3 items-center justify-center rounded-full ${
                  feito ? 'bg-sucesso-forte' : 'border border-borda-em-superficie'
                }`}
              >
                {feito ? <Check aria-hidden size={8} className="text-white" strokeWidth={4} /> : null}
              </span>
              <span
                className={`text-[9px] ${feito ? 'text-em-superficie-2 line-through' : 'text-em-superficie'}`}
              >
                {t as string}
              </span>
            </div>
          ))}
        </div>
      </Cartao>
      <Cartao>
        <p className="text-[8px] uppercase tracking-wide text-em-superficie-2">Peças baixadas</p>
        <Linha texto="Óleo 10W30 · 2 un" valor="−2" />
        <Linha texto="Pastilha de freio" valor="−1" />
      </Cartao>
    </div>
  )
}

/** 3. O dinheiro: o que entrou, o que falta e a cobrança pronta. */
export function TelaFinanceiro() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-em-fundo">Financeiro</p>
      <Cartao>
        <Linha texto="A receber no mês" valor="R$ 4.180,00" />
        <Linha texto="Já recebido" valor="R$ 12.640,00" />
        <Linha texto="Em atraso" valor="R$ 320,00" />
      </Cartao>
      <Cartao>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[9px] font-semibold text-em-superficie">OS nº 0091</p>
            <p className="truncate text-[8px] text-em-superficie-2">Juliana Peixoto</p>
          </div>
          <span className="rounded-full bg-atencao-fundo px-1.5 py-0.5 text-[8px] font-semibold text-atencao-forte">
            Em aberto
          </span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-borda-em-superficie py-1.5">
          <QrCode aria-hidden size={11} className="text-em-superficie" />
          <span className="text-[9px] font-semibold text-em-superficie">Cobrar por PIX</span>
        </div>
      </Cartao>
    </div>
  )
}

/** 4. A placa que acha a moto inteira. */
export function TelaBusca() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 rounded-lg bg-superficie px-2.5 py-2">
        <Search aria-hidden size={11} className="text-em-superficie-2" />
        <span className="text-[10px] font-semibold text-em-superficie">RFC4B12</span>
      </div>
      <Cartao>
        <p className="text-[10px] font-semibold text-em-superficie">Honda CG 160 Titan</p>
        <p className="text-[9px] text-em-superficie-2">Marcos Andrade · 18.400 km</p>
      </Cartao>
      <Cartao>
        <p className="text-[8px] uppercase tracking-wide text-em-superficie-2">Histórico</p>
        <Linha texto="12/08 · Revisão completa" valor="R$ 302,00" />
        <Linha texto="03/05 · Troca de pneu" valor="R$ 410,00" />
        <Linha texto="17/01 · Kit relação" valor="R$ 260,00" />
        <div className="mt-1 flex items-baseline justify-between border-t border-borda-em-superficie pt-1.5">
          <span className="text-[9px] text-em-superficie-2">Em aberto</span>
          <span className="text-[9px] font-semibold text-erro-forte">R$ 0,00</span>
        </div>
      </Cartao>
    </div>
  )
}

/** 5. O painel do dono, para a seção do computador. */
export function TelaPainel() {
  return (
    <div className="rounded-xl border border-borda-em-fundo bg-fundo-2 p-4 desktop:p-6">
      <p className="text-apoio text-em-fundo-2">Como vai a oficina · este mês</p>
      <div className="grid grid-cols-2 gap-3 pt-3 tablet:grid-cols-4">
        {[
          ['Conversão', '68,4%', '26 de 38 aprovados'],
          ['Ticket médio', 'R$ 287,40', 'por serviço'],
          ['Na bancada', '5', '2 aguardando peça'],
          ['A receber', 'R$ 4.180', '1 em atraso'],
        ].map(([rotulo, valor, apoio]) => (
          <div key={rotulo} className="rounded-controle bg-fundo p-3">
            <p className="text-[0.7rem] uppercase tracking-wide text-em-fundo-2">{rotulo}</p>
            <p className="pt-1 text-[1.25rem] font-bold text-em-fundo">{valor}</p>
            <p className="text-[0.7rem] text-em-fundo-2">{apoio}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1 pt-5">
        {[38, 52, 30, 64, 48, 72, 60, 84, 55, 78, 66, 92].map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-t bg-acento"
            style={{ height: `${h * 0.6}px`, opacity: 0.35 + i * 0.05 }}
          />
        ))}
      </div>
      <p className="pt-2 text-[0.7rem] text-em-fundo-2">Faturamento por dia</p>
    </div>
  )
}
