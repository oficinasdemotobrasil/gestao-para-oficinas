import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './ProvedorAuth'
import { usePermissoes } from './usePermissoes'
import { Carregando } from '@/componentes/ui/Carregando'

/** Exige sessão válida e cadastro ativo na oficina. */
export function RotaProtegida() {
  const { sessao, usuario, carregando, semVinculo } = useAuth()
  const local = useLocation()

  if (carregando) return <Carregando rotulo="Entrando…" />

  if (!sessao) {
    // Guarda de onde a pessoa veio, para voltar ao mesmo lugar depois do login.
    return <Navigate to="/entrar" state={{ de: local.pathname }} replace />
  }

  if (semVinculo || !usuario) return <Navigate to="/acesso-pendente" replace />

  return <Outlet />
}

/**
 * Rota que exige um perfil específico. Serve para tirar do caminho quem digitou
 * o endereço na mão — o bloqueio de verdade continua sendo o RLS.
 */
export function RotaPorPerfil({
  permitido,
}: {
  permitido: (p: ReturnType<typeof usePermissoes>) => boolean
}) {
  const permissoes = usePermissoes()
  if (!permissoes.perfil) return <Carregando />
  if (!permitido(permissoes)) return <Navigate to="/" replace />
  return <Outlet />
}

/** Já logado não vê a tela de login. */
export function RotaPublica() {
  const { sessao, carregando } = useAuth()
  if (carregando) return <Carregando />
  if (sessao) return <Navigate to="/" replace />
  return <Outlet />
}
