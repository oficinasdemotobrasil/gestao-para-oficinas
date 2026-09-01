import { Outlet } from 'react-router-dom'
import { TabBar } from './TabBar'
import { AvisoOffline } from './AvisoOffline'

/** Casca das telas logadas: aviso de conexão no topo, tab bar fixa embaixo. */
export function LayoutApp() {
  return (
    <div className="min-h-dvh bg-fundo">
      <AvisoOffline />
      <Outlet />
      <TabBar />
    </div>
  )
}
