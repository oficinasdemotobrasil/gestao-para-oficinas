import type { Config } from 'tailwindcss'

/**
 * Os mesmos tokens do aplicativo do cliente, copiados de propósito.
 *
 * Copiar é duplicação, e duplicação normalmente é defeito. Aqui não: são dois
 * aplicativos separados, e importar do outro criaria exatamente a ligação que a
 * separação existe para evitar. São seis cores; se um dia divergirem, ninguém
 * se machuca — o painel é interno.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: '#0b0b0c',
        superficie: '#ffffff',
        'superficie-escura': '#1a1a1c',
        'borda-escura': '#2a2a2e',
        'borda-clara': '#e6e6e9',
        acento: '#f5c518',
        'acento-pressionado': '#dcaf10',
        'acento-suave': '#fdf3cc',
        claro: '#111113',
        'claro-secundario': '#6b6b70',
        escuro: '#ffffff',
        'escuro-secundario': '#9a9aa0',
        sucesso: '#2e9e5b',
        'sucesso-fundo': '#e6f5ec',
        atencao: '#e0a800',
        'atencao-fundo': '#fdf4dc',
        erro: '#d93a3a',
        'erro-fundo': '#fdecec',
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter',
          'system-ui', 'sans-serif',
        ],
      },
      borderRadius: { card: '20px', controle: '14px', badge: '10px' },
    },
  },
  plugins: [],
} satisfies Config
