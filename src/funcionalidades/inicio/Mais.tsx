import { useNavigate } from 'react-router-dom'
import { Users2, Settings, LogOut, Share, Info } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes, nomeDoPerfil } from '@/auth/usePermissoes'

export function Mais() {
  const { usuario, oficina, sair } = useAuth()
  const p = usePermissoes()
  const navegar = useNavigate()

  // No iPhone não existe convite automático de instalação: o caminho é pelo
  // botão de compartilhar do Safari. Melhor ensinar do que deixar a pessoa sem saber.
  const noIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const jaInstalado = window.matchMedia('(display-mode: standalone)').matches

  return (
    <Tela>
      <CabecalhoTela
        titulo="Mais"
        contexto={oficina?.nome ?? undefined}
      />

      <ListaCard>
        <LinhaLista
          inicio={
            <IconeCirculo>
              <span className="text-corpo font-semibold">
                {usuario?.nome?.trim().charAt(0).toUpperCase() ?? '?'}
              </span>
            </IconeCirculo>
          }
          titulo={usuario?.nome ?? ''}
          descricao={usuario ? `${nomeDoPerfil[usuario.perfil]} · ${usuario.email}` : ''}
          comSeta={false}
        />
      </ListaCard>

      {(p.verColaboradores || p.verConfiguracoes) && (
        <>
          <TituloSecao>Oficina</TituloSecao>
          <ListaCard>
            {p.verColaboradores && (
              <LinhaLista
                inicio={
                  <IconeCirculo>
                    <Users2 aria-hidden size={20} />
                  </IconeCirculo>
                }
                titulo="Colaboradores"
                descricao="Quem tem acesso e o que cada um pode fazer"
                aoTocar={() => navegar('/colaboradores')}
              />
            )}
            {p.verConfiguracoes && (
              <LinhaLista
                inicio={
                  <IconeCirculo>
                    <Settings aria-hidden size={20} />
                  </IconeCirculo>
                }
                titulo="Configurações da oficina"
                descricao="Nome, contato, CNPJ e chave PIX"
                aoTocar={() => navegar('/configuracoes')}
              />
            )}
          </ListaCard>
        </>
      )}

      {noIOS && !jaInstalado && (
        <>
          <TituloSecao>Instalar no celular</TituloSecao>
          <div className="rounded-card bg-superficie-escura p-5">
            <p className="flex items-start gap-2 text-corpo text-escuro">
              <Share aria-hidden size={20} className="mt-0.5 shrink-0 text-acento" />
              <span>
                Toque em <strong>Compartilhar</strong> na barra do Safari e escolha
                <strong> Adicionar à Tela de Início</strong>. O app passa a abrir
                como aplicativo, em tela cheia.
              </span>
            </p>
          </div>
        </>
      )}

      <TituloSecao>Conta</TituloSecao>
      <Botao variante="contorno" largo icone={<LogOut aria-hidden size={20} />} onClick={sair}>
        Sair
      </Botao>

      <p className="flex items-start gap-2 px-1 pt-8 text-apoio text-escuro-secundario">
        <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
        Gestão para Oficinas · Fase 1
      </p>
    </Tela>
  )
}
