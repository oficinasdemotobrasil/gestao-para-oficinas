/**
 * A busca do balcão.
 *
 * Chegou uma moto: a pessoa tem a placa na mão, ou o nome do cliente, ou o
 * número da OS — e nenhuma das três diz em qual tela procurar. Aqui é um campo
 * só, e a resposta vem com o que o balcão realmente pergunta: de quem é a moto,
 * quando ela esteve aqui, tem serviço aberto, e o cliente está devendo.
 *
 * As buscas de Clientes e de Motos continuam existindo: elas servem a outra
 * coisa — percorrer a lista inteira, filtrar, achar quem sumiu. Esta serve ao
 * atendimento, que é pergunta única e resposta imediata.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bike, User, Wrench, Search, Phone } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { Card, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Badge } from '@/componentes/ui/Badge'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useDebounce } from '@/lib/useDebounce'
import { exibirPlaca, quilometragem, telefone, moeda, data } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import { StatusOsBadge } from '@/funcionalidades/ordens/StatusOsBadge'
import { buscar, vazio } from './api'

export function Busca() {
  const navegar = useNavigate()
  const p = usePermissoes()
  const [termo, setTermo] = useState('')
  const termoAtrasado = useDebounce(termo)
  // Duas letras para texto, e um dígito basta para número: a OS 7 é o que a
  // oficina nova procura o tempo todo, e exigir dois caracteres a escondia.
  const limpo = termoAtrasado.trim()
  const procurando = limpo.length >= 2 || /^\d+$/.test(limpo)

  const { data: resultado, isPending, isError, refetch } = useQuery({
    queryKey: ['busca', termoAtrasado],
    queryFn: () => buscar(termoAtrasado),
    enabled: procurando,
  })

  return (
    <Tela>
      <CabecalhoTela
        titulo="Buscar"
        contexto="Placa, nome do cliente, telefone ou número da OS"
      />

      <CampoBusca
        rotulo="O que você tem em mãos"
        valor={termo}
        aoMudar={setTermo}
        placeholder="ABC1D23, Carlos, 98888-1111, 42"
        autoFocus
      />

      {!procurando ? (
        <EstadoVazio
          icone={<Search aria-hidden size={28} />}
          titulo="Digite para buscar"
          descricao="Vale a placa da moto, o nome ou o telefone do cliente, e o número da ordem de serviço. Duas letras bastam — ou um número, para achar a OS."
        />
      ) : isPending ? (
        <EsqueletoLista linhas={4} />
      ) : isError ? (
        <EstadoErro aoTentarDeNovo={() => void refetch()} />
      ) : vazio(resultado) ? (
        <EstadoVazio
          icone={<Search aria-hidden size={28} />}
          titulo="Nada encontrado"
          descricao={`Nenhuma moto, cliente ou ordem com "${termoAtrasado}". Confira a placa ou tente pelo nome do cliente.`}
        />
      ) : (
        <>
          {resultado!.motos.length > 0 && (
            <>
              <TituloSecao>Motos</TituloSecao>
              <div className="flex flex-col gap-3">
                {resultado!.motos.map((m) => (
                  <button key={m.id} type="button" onClick={() => navegar(`/motos/${m.id}`)} className="text-left">
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-secao text-em-superficie">{exibirPlaca(m.placa)}</p>
                          <p className="truncate text-corpo text-em-superficie-2">
                            {[m.marca, m.modelo].filter(Boolean).join(' ') || 'Sem marca e modelo'}
                            {m.ano ? ` · ${m.ano}` : ''}
                            {m.km_atual ? ` · ${quilometragem(m.km_atual)}` : ''}
                          </p>
                          <p className="truncate pt-2 text-apoio text-em-superficie-2">
                            {m.dono_nome ? `De ${m.dono_nome}` : 'Sem dono cadastrado'}
                            {m.dono_telefone ? ` · ${telefone(m.dono_telefone)}` : ''}
                          </p>
                          {/* A pergunta do balcão: quando essa moto esteve aqui. */}
                          <p className="truncate pt-1 text-apoio text-em-superficie-2">
                            {m.ultimo_servico
                              ? `Último serviço em ${data(m.ultimo_servico)}`
                              : 'Nunca passou pela oficina'}
                          </p>
                        </div>
                        {m.servicos_abertos > 0 && (
                          <Badge tom="atencao">
                            {m.servicos_abertos === 1
                              ? '1 serviço aberto'
                              : `${m.servicos_abertos} serviços abertos`}
                          </Badge>
                        )}
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </>
          )}

          {resultado!.clientes.length > 0 && (
            <>
              <TituloSecao>Clientes</TituloSecao>
              <div className="flex flex-col gap-3">
                {resultado!.clientes.map((c) => (
                  <button key={c.id} type="button" onClick={() => navegar(`/clientes/${c.id}`)} className="text-left">
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-secao text-em-superficie">{c.nome}</p>
                          {c.telefone && (
                            <p className="flex items-center gap-1.5 text-corpo text-em-superficie-2">
                              <Phone aria-hidden size={14} />
                              {telefone(c.telefone)}
                            </p>
                          )}
                          <p className="truncate pt-2 text-apoio text-em-superficie-2">
                            {c.motos.length > 0
                              ? c.motos.map((m) => exibirPlaca(m.placa)).join(' · ')
                              : 'Nenhuma moto cadastrada'}
                          </p>
                        </div>
                        {/* Só aparece para quem pode ver dinheiro — para os
                            outros o banco devolve zero, e zero aqui seria a
                            afirmação errada de que o cliente não deve nada. */}
                        {p.verFinanceiro && Number(c.em_aberto) > 0 && (
                          <Badge tom="erro">{moeda(c.em_aberto)} em aberto</Badge>
                        )}
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </>
          )}

          {resultado!.ordens.length > 0 && (
            <>
              <TituloSecao>Ordens de serviço</TituloSecao>
              <div className="flex flex-col gap-3">
                {resultado!.ordens.map((o) => (
                  <LinhaLista
                    key={o.id}
                    aoTocar={() => navegar(`/ordens/${o.id}`)}
                    inicio={
                      <IconeCirculo>
                        <Wrench aria-hidden size={20} />
                      </IconeCirculo>
                    }
                    titulo={`OS ${String(o.numero).padStart(3, '0')}`}
                    descricao={[
                      o.placa ? exibirPlaca(o.placa) : null,
                      o.cliente_nome,
                      data(o.data),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    fim={<StatusOsBadge status={o.status} />}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Os dois caminhos completos continuam a um toque, para quem quer
          percorrer a lista em vez de procurar uma coisa só. */}
      {!procurando && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          {p.verMotos && (
            <button
              type="button"
              onClick={() => navegar('/motos')}
              className="flex min-h-[88px] flex-col items-start justify-between rounded-card bg-superficie p-4 text-left shadow-card active:opacity-90"
            >
              <Bike aria-hidden size={20} className="text-em-superficie-2" />
              <span className="text-corpo font-medium text-em-superficie">Todas as motos</span>
            </button>
          )}
          {p.verClientes && (
            <button
              type="button"
              onClick={() => navegar('/clientes')}
              className="flex min-h-[88px] flex-col items-start justify-between rounded-card bg-superficie p-4 text-left shadow-card active:opacity-90"
            >
              <User aria-hidden size={20} className="text-em-superficie-2" />
              <span className="text-corpo font-medium text-em-superficie">Todos os clientes</span>
            </button>
          )}
        </div>
      )}
    </Tela>
  )
}
