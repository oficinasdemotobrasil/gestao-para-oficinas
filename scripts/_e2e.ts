import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '/Users/edmelo/Desktop/SISTEMAS/MOTOS/.env.test.local' })
const a = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const EMAIL = 'e2e.vistoria@example.com', SENHA = 'Vistoria@2026'

if (process.argv[2] === 'remover') {
  const { limparOficina, limparContasDeTeste } = await import('./limpar-teste')
  const { data: ofs } = await a.from('oficinas').select('id, nome').like('nome', '[vistoria]%')
  for (const o of ofs ?? []) {
    const p = await limparOficina(a, o.id)
    console.log(p.length ? `✗ ${p.join('; ')}` : `✓ ${o.nome} removida`)
  }
  const p = await limparContasDeTeste(a, ['e2e.'])
  p.forEach(x => console.log('✗', x))
  process.exit(0)
}

const { data: of } = await a.from('oficinas').insert({ nome: '[vistoria] Oficina', telefone: '11933334444' }).select().single()
const { data: lista } = await a.auth.admin.listUsers()
const existente = lista.users.find(u => u.email === EMAIL)
let id: string
if (existente) { id = existente.id; await a.auth.admin.updateUserById(id, { password: SENHA }) }
else { const { data } = await a.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true }); id = data.user!.id }
await a.from('usuarios').upsert({ id, oficina_id: of!.id, nome: 'Vistoria', email: EMAIL, perfil: 'admin', ativo: true })
console.log('oficina de vistoria pronta')
