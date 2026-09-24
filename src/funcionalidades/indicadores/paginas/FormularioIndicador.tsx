/**
 * Cadastro do indicador.
 *
 * O código é o campo que importa: é ele que o cliente fala no balcão, e quem
 * escolhe é o próprio indicador ("JOAOMOTOS", "LAVAJATO2"). O banco guarda em
 * caixa alta e sem espaço, então quem digita "joao motos" chega no mesmo
 * lugar — a tela mostra isso enquanto se digita, para ninguém ser surpreendido
 * depois.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { Formulario, LinhaInteira } from '@/componentes/ui/Formulario'
import { Campo, AreaTexto, Interruptor } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { mascararTelefone } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { useAuth } from '@/auth/ProvedorAuth'
import { criarIndicador, atualizarIndicador, obterIndicador } from '../api'

/** A mesma limpeza que o banco faz: caixa alta, sem espaço. */
const limparCodigo = (valor: string) => valor.replace(/\s/g, '').toUpperCase()

export function FormularioIndicador() {
  const { id } = useParams<{ id: string }>()
  const editando = Boolean(id)
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const { oficina } = useAuth()

  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [codigo, setCodigo] = useState('')
  const [percentual, setPercentual] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const { data: indicador, isPending, isError, refetch } = useQuery({
    queryKey: ['indicador', id],
    queryFn: () => obterIndicador(id!),
    enabled: editando,
  })

  useEffect(() => {
    if (!indicador) return
    setNome(indicador.nome)
    setTel(indicador.telefone ? mascararTelefone(indicador.telefone) : '')
    setCodigo(indicador.codigo)
    setPercentual(indicador.percentual != null ? String(indicador.percentual).replace('.', ',') : '')
    setAtivo(indicador.ativo)
    setObservacoes(indicador.observacoes ?? '')
  }, [indicador])

  const salvar = useMutation({
    mutationFn: () => {
      const dados = {
        nome: nome.trim(),
        telefone: tel.replace(/\D/g, '') || null,
        codigo: limparCodigo(codigo),
        // Vazio é "usa o da oficina", e não zero. Zero seria dizer que este
        // indicador não ganha nada.
        percentual: percentual.trim() === '' ? null : paraNumero(percentual),
        ativo,
        observacoes: observacoes.trim() || null,
      }
      return editando ? atualizarIndicador(id!, dados) : criarIndicador(dados)
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['indicadores'] })
      void cache.invalidateQueries({ queryKey: ['indicador', id] })
      toast.sucesso(editando ? 'Indicador atualizado.' : 'Indicador cadastrado.')
      navegar('/indicadores', { replace: true })
    },
    onError: (e) => setErro(traduzirErro(e)),
  })

  function enviar() {
    setErro(null)
    if (nome.trim().length < 2) return setErro('Informe o nome do indicador.')
    const limpo = limparCodigo(codigo)
    if (limpo.length < 2) return setErro('O código precisa de pelo menos 2 caracteres.')
    if (!/^[A-Z0-9][A-Z0-9._-]{1,19}$/.test(limpo)) {
      return setErro('O código aceita letras, números, ponto, hífen e sublinhado. Até 20.')
    }
    const p = percentual.trim() === '' ? null : paraNumero(percentual)
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 100)) {
      return setErro('O percentual vai de 0 a 100.')
    }
    salvar.mutate()
  }

  if (editando && isPending) return <Carregando />
  if (editando && isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />

  const codigoLimpo = limparCodigo(codigo)

  return (
    <Tela>
      <CabecalhoInterno titulo={editando ? 'Editar indicador' : 'Novo indicador'} />

      <Formulario
        aoEnviar={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <Campo
          rotulo="Nome"
          obrigatorio
          autoCapitalize="words"
          placeholder="João da Esquina"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />

        <Campo
          rotulo="Telefone"
          type="tel"
          inputMode="numeric"
          placeholder="(11) 98765-4321"
          value={tel}
          onChange={(e) => setTel(mascararTelefone(e.target.value))}
        />

        <Campo
          rotulo="Código"
          obrigatorio
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="JOAOMOTOS"
          dica={
            codigoLimpo && codigoLimpo !== codigo
              ? `Vai ser guardado como ${codigoLimpo}`
              : 'O que o cliente fala no balcão. Quem escolhe é o indicador.'
          }
          className="uppercase tracking-wide"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />

        <Campo
          rotulo="Percentual próprio"
          inputMode="decimal"
          placeholder={String(oficina?.comissao_indicador_percentual ?? 10).replace('.', ',')}
          dica={`Deixe em branco para usar o da oficina (${String(
            oficina?.comissao_indicador_percentual ?? 10,
          ).replace('.', ',')}%).`}
          value={percentual}
          onChange={(e) => setPercentual(e.target.value)}
        />

        <LinhaInteira>
          <AreaTexto
            rotulo="Observações"
            placeholder="Como combinaram, onde ele fica, o que for útil lembrar"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </LinhaInteira>

        <LinhaInteira>
          {/* Inativo não apaga: as comissões antigas dele continuam valendo e
              precisam de um nome ao lado. */}
          <Interruptor
            rotulo="Ativo"
            descricao="Inativo some da hora de escolher, mas o histórico dele fica."
            marcado={ativo}
            aoMudar={setAtivo}
          />
        </LinhaInteira>

        {erro && (
          <LinhaInteira>
            <p
              role="alert"
              className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte"
            >
              {erro}
            </p>
          </LinhaInteira>
        )}

        <LinhaInteira>
          <Botao largo type="submit" carregando={salvar.isPending}>
            {editando ? 'Salvar alterações' : 'Cadastrar indicador'}
          </Botao>
        </LinhaInteira>
      </Formulario>
    </Tela>
  )
}
