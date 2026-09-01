import type { Config } from 'tailwindcss'

/** O Tailwind não guarda valores: ele só aponta para as variáveis de
 *  src/estilos/tokens.css. Trocar uma cor é trocar em um lugar só. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: 'var(--cor-fundo)',
        superficie: 'var(--cor-superficie)',
        'superficie-escura': 'var(--cor-superficie-escura)',
        'borda-escura': 'var(--cor-borda-escura)',
        'borda-clara': 'var(--cor-borda-clara)',
        acento: 'var(--cor-acento)',
        'acento-pressionado': 'var(--cor-acento-pressionado)',
        'acento-suave': 'var(--cor-acento-suave)',
        claro: 'var(--cor-texto-claro)',
        'claro-secundario': 'var(--cor-texto-claro-secundario)',
        escuro: 'var(--cor-texto-escuro)',
        'escuro-secundario': 'var(--cor-texto-escuro-secundario)',
        sucesso: 'var(--cor-sucesso)',
        'sucesso-fundo': 'var(--cor-sucesso-fundo)',
        atencao: 'var(--cor-atencao)',
        'atencao-fundo': 'var(--cor-atencao-fundo)',
        erro: 'var(--cor-erro)',
        'erro-fundo': 'var(--cor-erro-fundo)',
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
      spacing: {
        toque: 'var(--altura-toque)',
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
