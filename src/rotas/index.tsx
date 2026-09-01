import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RotaProtegida, RotaPublica, RotaPorPerfil } from '@/auth/RotaProtegida'
import { LayoutApp } from '@/componentes/layout/LayoutApp'
import { Entrar } from '@/auth/paginas/Entrar'
import { EsqueciSenha } from '@/auth/paginas/EsqueciSenha'
import { RedefinirSenha } from '@/auth/paginas/RedefinirSenha'
import { AcessoPendente } from '@/auth/paginas/AcessoPendente'
import { Inicio } from '@/funcionalidades/inicio/Inicio'
import { Mais } from '@/funcionalidades/inicio/Mais'
import { EmBreve } from '@/funcionalidades/inicio/EmBreve'

export const rotas = createBrowserRouter([
  {
    element: <RotaPublica />,
    children: [
      { path: '/entrar', element: <Entrar /> },
      { path: '/esqueci-a-senha', element: <EsqueciSenha /> },
    ],
  },

  // Fora do RotaPublica: o link do e-mail cria uma sessão temporária, então
  // quem chega aqui já está "logado" e seria expulso para a home.
  { path: '/redefinir-senha', element: <RedefinirSenha /> },
  { path: '/acesso-pendente', element: <AcessoPendente /> },

  {
    element: <RotaProtegida />,
    children: [
      {
        element: <LayoutApp />,
        children: [
          { path: '/', element: <Inicio /> },
          { path: '/mais', element: <Mais /> },

          {
            element: <RotaPorPerfil permitido={(p) => p.verClientes} />,
            children: [{ path: '/clientes/*', element: <EmBreve titulo="Clientes" /> }],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verMotos} />,
            children: [{ path: '/motos/*', element: <EmBreve titulo="Motos" /> }],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verCatalogo} />,
            children: [{ path: '/catalogo/*', element: <EmBreve titulo="Catálogo" /> }],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verColaboradores} />,
            children: [
              { path: '/colaboradores/*', element: <EmBreve titulo="Colaboradores" /> },
            ],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verConfiguracoes} />,
            children: [
              { path: '/configuracoes', element: <EmBreve titulo="Configurações" /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
])
