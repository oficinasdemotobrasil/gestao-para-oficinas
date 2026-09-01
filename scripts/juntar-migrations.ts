/**
 * Junta todas as migrations num arquivo só, para colar no SQL Editor do Supabase.
 *
 * O arquivo gerado é CÓPIA, nunca origem: a verdade está em supabase/migrations.
 * Ele existe porque o painel do Supabase não roda vários arquivos de uma vez.
 * Rode de novo sempre que criar uma migration:
 *
 *   npm run migrations:juntar
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(raiz, 'supabase/migrations')
const saida = path.join(raiz, 'supabase/_todas_migrations_em_ordem.sql')

const arquivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

const partes = [
  '-- ============================================================',
  '-- ARQUIVO GERADO — não edite aqui.',
  '--',
  '-- Junta as migrations de supabase/migrations na ordem, para colar de uma vez',
  '-- no SQL Editor do Supabase. A fonte da verdade são os arquivos numerados;',
  '-- este aqui é só a cópia colável. Para atualizar: npm run migrations:juntar',
  '--',
  `-- Migrations incluídas: ${arquivos.length}`,
  '-- ============================================================',
  '',
]

for (const arquivo of arquivos) {
  partes.push(
    '-- ============================================================',
    `-- ${arquivo}`,
    '-- ============================================================',
    '',
    (await readFile(path.join(dir, arquivo), 'utf8')).trimEnd(),
    '',
  )
}

await writeFile(saida, partes.join('\n') + '\n')
console.log(`Gerado supabase/_todas_migrations_em_ordem.sql com ${arquivos.length} migrations:`)
arquivos.forEach((a) => console.log(`  ${a}`))
