import type { Config } from 'tailwindcss'

/** O Tailwind não guarda valores: ele só aponta para as variáveis de
 *  src/estilos/tokens.css. Trocar uma cor é trocar em um lugar só. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    /**
     * Pontos de quebra com nome, e SUBSTITUINDO os padrões do Tailwind em vez
     * de somar a eles.
     *
     * Substituir é de propósito: com sm/md/lg ainda disponíveis, uma classe
     * `md:flex` escrita sem pensar passaria despercebida na revisão e o app
     * teria dois vocabulários de tamanho. Aqui só existem estes três — e quem
     * tentar usar outro recebe erro do Tailwind, não um layout torto.
     *
     * Não existe prefixo `celular:` para o caso comum: o layout do celular é o
     * PADRÃO, escrito sem prefixo nenhum. É essa escolha que garante a regra de
     * ouro desta fase — nada que se acrescente para telas maiores pode alcançar
     * o celular, porque min-width nunca desce.
     *
     * `so-celular:` existe para o caso raro do contrário: algo que só faz
     * sentido no celular, como a barra de abas. Use pouco.
     */
    screens: {
      tablet: '768px',
      desktop: '1024px',
      amplo: '1440px',
      'so-celular': { max: '767px' },
    },
    extend: {
      colors: {
        fundo: 'rgb(var(--cor-fundo) / <alpha-value>)',
        'fundo-2': 'rgb(var(--cor-fundo-2) / <alpha-value>)',
        superficie: 'rgb(var(--cor-superficie) / <alpha-value>)',
        'borda-em-fundo': 'rgb(var(--cor-borda-em-fundo) / <alpha-value>)',
        'borda-em-superficie': 'rgb(var(--cor-borda-em-superficie) / <alpha-value>)',
        acento: 'rgb(var(--cor-acento) / <alpha-value>)',
        'acento-pressionado': 'rgb(var(--cor-acento-pressionado) / <alpha-value>)',
        'acento-suave': 'rgb(var(--cor-acento-suave) / <alpha-value>)',
        /* O acento quando é TEXTO. Escurece no tema claro; `acento` não. */
        'acento-forte': 'rgb(var(--cor-acento-forte) / <alpha-value>)',
        /* Superfície invertida: o botão secundário, preto nos dois temas. */
        inverso: 'rgb(var(--cor-inverso) / <alpha-value>)',
        'em-inverso': 'rgb(var(--cor-em-inverso) / <alpha-value>)',
        /* Nomeadas pelo que ficam EM CIMA, não pela claridade que têm: no
           tema claro os dois viram escuros, e um token chamado "escuro"
           guardando cor escura para fundo claro envenena o código. */
        'em-superficie': 'rgb(var(--cor-em-superficie) / <alpha-value>)',
        'em-superficie-2': 'rgb(var(--cor-em-superficie-2) / <alpha-value>)',
        'em-fundo': 'rgb(var(--cor-em-fundo) / <alpha-value>)',
        'em-fundo-2': 'rgb(var(--cor-em-fundo-2) / <alpha-value>)',
        sucesso: 'rgb(var(--cor-sucesso) / <alpha-value>)',
        'sucesso-forte': 'rgb(var(--cor-sucesso-forte) / <alpha-value>)',
        'sucesso-fundo': 'rgb(var(--cor-sucesso-fundo) / <alpha-value>)',
        atencao: 'rgb(var(--cor-atencao) / <alpha-value>)',
        'atencao-forte': 'rgb(var(--cor-atencao-forte) / <alpha-value>)',
        'atencao-fundo': 'rgb(var(--cor-atencao-fundo) / <alpha-value>)',
        erro: 'rgb(var(--cor-erro) / <alpha-value>)',
        'erro-forte': 'rgb(var(--cor-erro-forte) / <alpha-value>)',
        'erro-fundo': 'rgb(var(--cor-erro-fundo) / <alpha-value>)',
      },
      fontFamily: {
        sans: 'var(--fonte)',
      },
      fontSize: {
        destaque: ['40px', { lineHeight: '44px', fontWeight: '700' }],
        titulo: ['28px', { lineHeight: '34px', fontWeight: '700' }],
        secao: ['20px', { lineHeight: '26px', fontWeight: '600' }],
        corpo: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        rotulo: ['14px', { lineHeight: '20px', fontWeight: '500' }],
        apoio: ['13px', { lineHeight: '18px', fontWeight: '400' }],
        micro: ['11px', { lineHeight: '14px', fontWeight: '600' }],
      },
      borderRadius: {
        card: 'var(--raio-card)',
        controle: 'var(--raio-controle)',
        badge: 'var(--raio-badge)',
        folha: 'var(--raio-folha)',
      },
      boxShadow: {
        card: 'var(--sombra-card)',
        flutuante: 'var(--sombra-flutuante)',
      },
      maxWidth: {
        conteudo: 'var(--largura-conteudo)',
        leitura: 'var(--largura-leitura)',
        janela: 'var(--largura-janela)',
      },
      spacing: {
        toque: 'var(--altura-toque)',
        'toque-fino': 'var(--altura-toque-fino)',
        menu: 'var(--largura-menu)',
        'menu-estreito': 'var(--largura-menu-estreito)',
        botao: 'var(--altura-botao)',
        campo: 'var(--altura-campo)',
        linha: 'var(--altura-linha-lista)',
        tabbar: 'var(--altura-tabbar)',
        'seguro-baixo': 'env(safe-area-inset-bottom)',
        'seguro-cima': 'env(safe-area-inset-top)',
      },
      transitionTimingFunction: {
        padrao: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      transitionDuration: {
        padrao: '160ms',
        folha: '200ms',
      },
    },
  },
  plugins: [],
} satisfies Config
