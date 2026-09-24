/**
 * A moldura das telas de acesso: entrar, criar conta, recuperar senha.
 *
 * Duas colunas no computador — a imagem da marca ocupando a esquerda inteira e
 * o formulário à direita, num respiro de tela grande. No celular a imagem sai
 * de cena: a tela é estreita e alta, e qualquer faixa empurraria os campos
 * para baixo da dobra. Quem entra pelo celular quer digitar e passar.
 *
 * A moldura também zera a cor da oficina. O app guarda a cor de quem entrou
 * por último neste aparelho, para abrir com a cara dela — mas isso vale depois
 * de entrar. Aqui, quem chega pode ser de qualquer oficina, e a tela pintada
 * com a cor e o logo de outra empresa faz parecer que a pessoa errou o
 * endereço. Foi exatamente o que aconteceu: a tela do GIRO abria verde, com a
 * marca de outra oficina.
 */
import { useEffect, type ReactNode } from 'react'
import { aplicarCorDaMarca } from '@/lib/marca'
import { Logotipo, Simbolo } from '@/componentes/marca/Logotipo'

/**
 * A foto que ocupa o lado esquerdo no computador.
 *
 * Enquanto não houver foto de oficina de moto que seja nossa — feita numa
 * oficina ou comprada com licença —, o lado fica com a composição da marca.
 * Foto de banco de imagem baixada sem licença é processo, não é economia.
 *
 * Para colocar a foto: salve em `public/entrada/oficina.jpg` e troque o null
 * por '/entrada/oficina.jpg'. O resto já está pronto, inclusive o véu escuro
 * que mantém o texto legível por cima dela.
 */
const FOTO_DA_ENTRADA: string | null = null

export function MolduraDeEntrada({ children }: { children: ReactNode }) {
  useEffect(() => {
    aplicarCorDaMarca(null)
  }, [])

  return (
    <main className="min-h-dvh bg-fundo desktop:grid desktop:grid-cols-[1.15fr_minmax(30rem,0.85fr)]">
      <PainelDaMarca />

      <section className="flex min-h-dvh flex-col justify-center px-5 py-10 desktop:px-12">
        <div className="mx-auto w-full max-w-lg">
          {/* No computador o logotipo já está grande no painel ao lado; aqui
              ele apareceria duas vezes na mesma tela. */}
          <div className="flex justify-center pb-7 desktop:hidden">
            <Logotipo tamanho={40} />
          </div>
          {children}
        </div>
      </section>
    </main>
  )
}

function PainelDaMarca() {
  return (
    <aside className="relative hidden overflow-hidden bg-inverso desktop:flex desktop:flex-col desktop:justify-between desktop:p-12">
      {FOTO_DA_ENTRADA ? (
        <>
          <img
            src={FOTO_DA_ENTRADA}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Véu chapado, sem degradê: a identidade não usa gradiente, e é ele
              que garante o contraste do texto sobre qualquer foto. */}
          <span aria-hidden className="absolute inset-0 bg-inverso/75" />
        </>
      ) : (
        /* Sem foto, o próprio símbolo vira a imagem: enorme e cortado pela
           borda, na cor de superfície da identidade. */
        <Simbolo tamanho="120%" className="absolute -right-[18%] -top-[10%] text-[#17171A]" />
      )}

      {/* O painel é escuro nos dois temas, então aqui vale sempre a versão de
          fundo preto: letras brancas e símbolo amarelo. O token do símbolo fica
          preso ao amarelo neste pedaço da árvore — solto, ele escureceria junto
          com o tema claro e sumiria dentro do próprio painel. */}
      <div
        className="relative text-em-inverso"
        style={{ '--cor-marca-simbolo': '245 197 24' } as React.CSSProperties}
      >
        <Logotipo tamanho={56} />
      </div>

      <div className="relative max-w-md">
        <p
          className="text-[40px] leading-[1.1] text-em-inverso"
          style={{
            fontFamily: "'Archivo', var(--fonte)",
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          O sistema que organiza sua oficina de moto.
        </p>
        <ul className="flex flex-col gap-2 pt-6 text-corpo text-em-inverso-2">
          <li>Orçamento pronto no balcão, com o cliente na frente.</li>
          <li>Ordem de serviço, peça baixada do estoque e garantia.</li>
          <li>O que entrou e o que falta receber, no mesmo lugar.</li>
        </ul>
      </div>

      <p className="relative text-apoio text-em-inverso-2">
        Feito para ser usado com a mão suja, no celular.
      </p>
    </aside>
  )
}
