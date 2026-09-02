import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RotaProtegida, RotaPublica, RotaPorPerfil } from '@/auth/RotaProtegida'
import { LayoutApp } from '@/componentes/layout/LayoutApp'
import { Entrar } from '@/auth/paginas/Entrar'
import { EsqueciSenha } from '@/auth/paginas/EsqueciSenha'
import { RedefinirSenha } from '@/auth/paginas/RedefinirSenha'
import { AcessoPendente } from '@/auth/paginas/AcessoPendente'
import { Inicio } from '@/funcionalidades/inicio/Inicio'
import { Mais } from '@/funcionalidades/inicio/Mais'
import { ListaClientes } from '@/funcionalidades/clientes/paginas/ListaClientes'
import { FormularioCliente } from '@/funcionalidades/clientes/paginas/FormularioCliente'
import { DetalheCliente } from '@/funcionalidades/clientes/paginas/DetalheCliente'
import { ListaMotos } from '@/funcionalidades/motos/paginas/ListaMotos'
import { FormularioMoto } from '@/funcionalidades/motos/paginas/FormularioMoto'
import { DetalheMoto } from '@/funcionalidades/motos/paginas/DetalheMoto'
import { Catalogo } from '@/funcionalidades/catalogo/Catalogo'
import { FormularioProduto } from '@/funcionalidades/produtos/paginas/FormularioProduto'
import { DetalheProduto } from '@/funcionalidades/produtos/paginas/DetalheProduto'
import { FormularioServico } from '@/funcionalidades/servicos/paginas/FormularioServico'
import { ListaColaboradores } from '@/funcionalidades/colaboradores/paginas/ListaColaboradores'
import { FormularioColaborador } from '@/funcionalidades/colaboradores/paginas/FormularioColaborador'
import { Configuracoes } from '@/funcionalidades/configuracoes/Configuracoes'

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

          // O bloqueio por perfil aqui é conveniência de navegação: tira do
          // caminho quem digitou o endereço na mão. Quem realmente recusa o
          // acesso ao dado é o RLS, no banco.
          {
            element: <RotaPorPerfil permitido={(p) => p.verClientes} />,
            children: [
              { path: '/clientes', element: <ListaClientes /> },
              { path: '/clientes/novo', element: <FormularioCliente /> },
              { path: '/clientes/:id', element: <DetalheCliente /> },
              { path: '/clientes/:id/editar', element: <FormularioCliente /> },
            ],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verMotos} />,
            children: [
              { path: '/motos', element: <ListaMotos /> },
              { path: '/motos/nova', element: <FormularioMoto /> },
              { path: '/motos/:id', element: <DetalheMoto /> },
              { path: '/motos/:id/editar', element: <FormularioMoto /> },
            ],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verCatalogo} />,
            children: [
              { path: '/catalogo', element: <Catalogo /> },
              // O detalhe do produto é onde se lança estoque, então o vendedor
              // também alcança. Editar o cadastro continua sendo do admin.
              { path: '/catalogo/produtos/:id', element: <DetalheProduto /> },
            ],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.editarCatalogo} />,
            children: [
              { path: '/catalogo/produtos/novo', element: <FormularioProduto /> },
              { path: '/catalogo/produtos/:id/editar', element: <FormularioProduto /> },
              { path: '/catalogo/servicos/novo', element: <FormularioServico /> },
              { path: '/catalogo/servicos/:id', element: <FormularioServico /> },
            ],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verColaboradores} />,
            children: [
              { path: '/colaboradores', element: <ListaColaboradores /> },
              { path: '/colaboradores/novo', element: <FormularioColaborador /> },
              { path: '/colaboradores/:id', element: <FormularioColaborador /> },
            ],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verConfiguracoes} />,
            children: [{ path: '/configuracoes', element: <Configuracoes /> }],
          },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
])
