import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.test.local', quiet: true })
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })
const { data } = await s.auth.admin.listUsers({ perPage: 200 })
const u = data.users.find((x) => x.email === 'print.estornos@oficinasdemoto.com.br')!
const { error } = await s.from('admins_plataforma')
  .insert({ usuario_id: u.id, observacao: 'temporário — print dos estornos' })
if (error) throw error
const { data: todos } = await s.from('admins_plataforma').select('observacao')
console.log('admins agora:', JSON.stringify(todos?.map((t: any) => t.observacao)))
