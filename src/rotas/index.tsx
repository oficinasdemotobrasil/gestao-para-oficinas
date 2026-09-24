import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RotaProtegida, RotaPublica, RotaPorPerfil } from '@/auth/RotaProtegida'
import { EstruturaDoApp } from '@/componentes/layout/EstruturaDoApp'
import { Entrar } from '@/auth/paginas/Entrar'
import { EsqueciSenha } from '@/auth/paginas/EsqueciSenha'
import { RedefinirSenha } from '@/auth/paginas/RedefinirSenha'
import { AcessoPendente } from '@/auth/paginas/AcessoPendente'
import { Inicio } from '@/funcionalidades/inicio/Inicio'
import { Mais } from '@/funcionalidades/inicio/Mais'
import { ListaClientes } from '@/funcionalidades/clientes/paginas/ListaClientes'
import { FormularioCliente } from '@/funcionalidades/clientes/paginas/FormularioCliente'
import { DetalheCliente } from '@/funcionalidades/clientes/paginas/DetalheCliente'
import { ClientesInativos } from '@/funcionalidades/clientes/paginas/ClientesInativos'
import { Ajuda } from '@/funcionalidades/ajuda/Ajuda'
import { Busca } from '@/funcionalidades/busca/Busca'
import { Indicadores } from '@/funcionalidades/indicadores/paginas/Indicadores'
import { FormularioIndicador } from '@/funcionalidades/indicadores/paginas/FormularioIndicador'
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
import { Financeiro } from '@/funcionalidades/financeiro/paginas/Financeiro'
import { NotasFiscais } from '@/funcionalidades/notas-fiscais/paginas/NotasFiscais'
import { EditorNotaEntrada } from '@/funcionalidades/notas-fiscais/paginas/EditorNotaEntrada'
import { DetalheNotaEntrada } from '@/funcionalidades/notas-fiscais/paginas/DetalheNotaEntrada'
import { EditorNotaSaida } from '@/funcionalidades/notas-fiscais/paginas/EditorNotaSaida'
import { DetalheNotaSaida } from '@/funcionalidades/notas-fiscais/paginas/DetalheNotaSaida'
import { ListaOrcamentos } from '@/funcionalidades/orcamentos/paginas/ListaOrcamentos'
import { EditorOrcamento } from '@/funcionalidades/orcamentos/paginas/EditorOrcamento'
import { DetalheOrcamento } from '@/funcionalidades/orcamentos/paginas/DetalheOrcamento'
import { CriarConta } from '@/auth/paginas/CriarConta'
import { Privacidade, Termos } from '@/funcionalidades/legal/PaginaLegal'
import { ListaOrdens } from '@/funcionalidades/ordens/paginas/ListaOrdens'
import { OrdemDeServico } from '@/funcionalidades/ordens/paginas/OrdemDeServico'

export const rotas = createBrowserRouter([
  {
    element: <RotaPublica />,
    children: [
      { path: '/entrar', element: <Entrar /> },
      { path: '/esqueci-a-senha', element: <EsqueciSenha /> },
      { path: '/criar-conta', element: <CriarConta /> },
    ],
  },

  // Termos e privacidade ficam fora do RotaPublica: quem já está logado
  // também precisa poder reler, e lá seria expulso para a home.
  /*
   * Porta de conferência da ajuda, só em desenvolvimento.
   *
   * A ajuda mora dentro da área logada, e logar exige senha — então, sem esta
   * porta, a única forma de conferir o texto e o layout seria publicar e pedir
   * para alguém olhar. `import.meta.env.DEV` é falso no build de produção, e o
   * Vite remove o trecho inteiro: no site publicado esta rota não existe.
   */
  ...(import.meta.env.DEV
    ? [
        { path: '/previa-da-ajuda', element: <Ajuda mostrarTudo /> },
        {
          path: '/previa-do-cadastro',
          element: (
            <CriarConta
              previa={[
                {
                  id: 'gratuito',
                  nome: 'Teste 7 Dias',
                  descricao: 'Para conhecer o sistema sem compromisso.',
                  preco_mensal: 0,
                  dias_de_teste: 7,
                  limite_colaboradores: 2,
                  tem_financeiro: false,
                  beneficios: [
                    'Liberado para até 2 pessoas testarem por 7 dias.',
                    'Organize peças e serviços sem complicação.',
                  ],
                },
                {
                  id: 'essencial',
                  nome: 'Operacional',
                  descricao: 'A oficina organizada, do orçamento à entrega.',
                  preco_mensal: 59.9,
                  dias_de_teste: null,
                  limite_colaboradores: 2,
                  tem_financeiro: false,
                  beneficios: [
                    'Até 2 acessos para organizar a operação diária.',
                    'Envie propostas mais rápido direto no WhatsApp.',
                    'Acompanhe o tempo de serviço de cada mecânico.',
                  ],
                },
                {
                  id: 'completo',
                  nome: 'Gestão Total',
                  descricao: 'Tudo, incluindo o dinheiro.',
                  preco_mensal: 99.9,
                  dias_de_teste: null,
                  limite_colaboradores: 5,
                  tem_financeiro: true,
                  beneficios: [
                    'Até 5 acessos para integrar a equipe da oficina.',
                    'Controle financeiro total (veja o fluxo de caixa real).',
                    'Cobre por PIX e mande pelo WhatsApp num toque.',
                  ],
                },
              ]}
            />
          ),
        },
      ]
    : []),

  { path: '/termos', element: <Termos /> },
  { path: '/privacidade', element: <Privacidade /> },

  // Fora do RotaPublica: o link do e-mail cria uma sessão temporária, então
  // quem chega aqui já está "logado" e seria expulso para a home.
  { path: '/redefinir-senha', element: <RedefinirSenha /> },
  { path: '/acesso-pendente', element: <AcessoPendente /> },

  {
    element: <RotaProtegida />,
    children: [
      {
        element: <EstruturaDoApp />,
        children: [
          { path: '/', element: <Inicio /> },
          { path: '/mais', element: <Mais /> },

          // O bloqueio por perfil aqui é conveniência de navegação: tira do
          // caminho quem digitou o endereço na mão. Quem realmente recusa o
          // acesso ao dado é o RLS, no banco.
          // A ajuda é de todo mundo, inclusive do mecânico: cada perfil vê os
          // caminhos que a tela dele tem.
          { path: '/ajuda', element: <Ajuda /> },
          // Indicador e comissão são dinheiro que sai: do admin, como o resto
          // do financeiro.
          {
            element: <RotaPorPerfil permitido={(p) => p.ehAdmin} />,
            children: [
              { path: '/indicadores', element: <Indicadores /> },
              { path: '/indicadores/novo', element: <FormularioIndicador /> },
              { path: '/indicadores/:id', element: <FormularioIndicador /> },
            ],
          },
          // A busca do balcão: quem enxerga moto chega nela, porque é a
          // pergunta que o atendimento faz o dia inteiro.
          {
            element: <RotaPorPerfil permitido={(p) => p.verMotos} />,
            children: [{ path: '/buscar', element: <Busca /> }],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verClientes} />,
            children: [
              { path: '/clientes', element: <ListaClientes /> },
              { path: '/clientes/novo', element: <FormularioCliente /> },
              { path: '/clientes/sumidos', element: <ClientesInativos /> },
              { path: '/clientes/:id', element: <DetalheCliente /> },
              { path: '/clientes/:id/editar', element: <FormularioCliente /> },
            ],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verOrcamentos} />,
            children: [
              { path: '/orcamentos', element: <ListaOrcamentos /> },
              { path: '/orcamentos/novo', element: <EditorOrcamento /> },
              { path: '/orcamentos/:id', element: <DetalheOrcamento /> },
              { path: '/orcamentos/:id/editar', element: <EditorOrcamento /> },
            ],
          },
          // A lista é do atendimento. O mecânico chega às ordens dele pela tela
          // inicial, que já é só delas — e digitando /ordens ele via a lista da
          // oficina vazia, sem vazar nada, mas numa tela que não é dele.
          {
            element: <RotaPorPerfil permitido={(p) => p.verOrdensDaOficina} />,
            children: [{ path: '/ordens', element: <ListaOrdens /> }],
          },
          {
            element: <RotaPorPerfil permitido={(p) => p.verOrdens} />,
            children: [{ path: '/ordens/:id', element: <OrdemDeServico /> }],
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
            element: <RotaPorPerfil permitido={(p) => p.verPainel} />,
            children: [{ path: '/financeiro', element: <Financeiro /> }],
          },
          // Mesma regra do Financeiro: perfil E plano — notas fiscais falam
          // direto com Contas a Pagar/Receber, que também é assim gated.
          {
            element: <RotaPorPerfil permitido={(p) => p.verFinanceiro} />,
            children: [
              // Uma lista só, com entrada e saída em abas (?tipo=saida).
              { path: '/notas-fiscais', element: <NotasFiscais /> },
              { path: '/notas-fiscais/entrada/nova', element: <EditorNotaEntrada /> },
              { path: '/notas-fiscais/entrada/:id', element: <DetalheNotaEntrada /> },
              { path: '/notas-fiscais/saida/nova', element: <EditorNotaSaida /> },
              { path: '/notas-fiscais/saida/:id', element: <DetalheNotaSaida /> },
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
