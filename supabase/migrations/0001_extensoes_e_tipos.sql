-- 0001 — Extensões e tipos enumerados
-- Todos os estados do sistema são enums do Postgres: um status inválido nem
-- chega a ser gravado, em vez de virar texto livre que ninguém consegue mais limpar.

create extension if not exists "pgcrypto" with schema extensions;

-- Perfis de acesso. A restrição de cada um vive nas políticas de RLS
-- (migrations 0009 a 0011), não apenas na interface.
create type public.perfil_usuario as enum ('admin', 'vendedor', 'mecanico');

create type public.plano_oficina as enum ('gratuito', 'essencial', 'completo');
create type public.status_oficina as enum ('ativa', 'suspensa', 'cancelada');
create type public.tipo_chave_pix as enum ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');

create type public.tipo_item as enum ('produto', 'servico');

create type public.status_orcamento as enum (
  'rascunho', 'enviado', 'aprovado', 'recusado', 'expirado'
);

create type public.status_os as enum (
  'aberta', 'em_andamento', 'pausada', 'finalizada', 'entregue', 'cancelada'
);

create type public.tipo_movimentacao as enum ('entrada', 'saida', 'ajuste');

create type public.status_conta as enum ('aberta', 'paga', 'atrasada', 'cancelada');

-- Carimbo de atualização, usado por trigger em todas as tabelas.
-- Fica aqui, antes das tabelas, porque os triggers de 0002 já dependem dele.
create or replace function public.marcar_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;
