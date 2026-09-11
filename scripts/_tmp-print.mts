/** Cria um admin temporário da plataforma só para o print, e some depois. */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.test.local', quiet: true })
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

const EMAIL = 'print.estornos@oficinasdemoto.com.br'
const SENHA = process.argv[2]!

if (process.argv[3] === 'apagar') {
  const { data } = await s.auth.admin.listUsers({ perPage: 200 })
  const u = data.users.find((x) => x.email === EMAIL)
  if (u) {
    await s.from('admins_plataforma').delete().eq('usuario_id', u.id)
    await s.auth.admin.deleteUser(u.id)
  }
  const { data: resto } = await s.from('admins_plataforma').select('observacao')
  console.log('apagado. restam:', JSON.stringify(resto?.map((r: any) => r.observacao)))
} else {
  const { data, error } = await s.auth.admin.createUser({
    email: EMAIL, password: SENHA, email_confirm: true,
  })
  if (error) throw error
  const { error: e2 } = await s.from('admins_plataforma')
    .insert({ usuario_id: data.user.id, observacao: 'temporário — print dos estornos' })
  if (e2) throw e2
  console.log('criado e promovido:', EMAIL)
}
