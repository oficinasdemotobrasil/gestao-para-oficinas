-- Auditoria de segurança do banco do GIRO (21/10/2026) — SOMENTE LEITURA.
-- Rode com: ./scripts/aplicar-migracao.sh --so-conferir supabase/conferencias/auditoria-de-seguranca.sql
--
-- Esperado depois da 0086: nenhuma "tabela_sem_rls"; 35 tabelas; 5 "politica_aberta"
-- (planos, precos e taxas_cartao só leitura; vitalicios e tentativas_de_cadastro
-- com using=false); 3 buckets; 2 views com anon_le=false; só 3 "definer_aberta_ao_anonimo"
-- (simular_parcelas, vagas_vitalicias_restantes, valor_parcelado).
select 1 as ordem, 'tabela_sem_rls' as secao, c.relname::text as detalhe
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
union all
select 2, 'tabelas_public_total', count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
union all
select 3, 'politica_aberta', p.schemaname || '.' || p.tablename || ' | ' || p.policyname || ' | ' || p.cmd
       || ' | papeis=' || array_to_string(p.roles, ',') || ' | using=' || coalesce(p.qual, '-')
       || ' | check=' || coalesce(p.with_check, '-')
  from pg_policies p
 where p.schemaname in ('public', 'storage')
   and (p.qual = 'true' or p.with_check = 'true' or 'anon' = any(p.roles) or 'public' = any(p.roles))
union all
select 4, 'bucket', b.id || ' | publico=' || b.public || ' | limite_bytes=' || coalesce(b.file_size_limit::text, '-')
  from storage.buckets b
union all
select 5, 'view', c.relname || ' | opcoes=' || coalesce(array_to_string(c.reloptions, ','), '-')
       || ' | anon_le=' || has_table_privilege('anon', c.oid, 'select')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
union all
select 6, 'definer_aberta_ao_anonimo', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and p.prorettype <> 'trigger'::regtype
   and has_function_privilege('anon', p.oid, 'execute')
union all
select 7, 'tamanho_do_banco', pg_size_pretty(pg_database_size(current_database()))
union all
select 8, 'maiores_tabelas', t.nome || ' = ' || pg_size_pretty(t.bytes)
  from (select c.relname::text as nome, pg_total_relation_size(c.oid) as bytes
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
         order by 2 desc limit 5) t
union all
select 9, 'arquivos_por_bucket', o.bucket_id || ' = ' || count(*) || ' arquivos, '
       || pg_size_pretty(coalesce(sum((o.metadata ->> 'size')::bigint), 0))
  from storage.objects o
 group by o.bucket_id
union all
select 10, 'oficinas_e_usuarios', (select count(*) from public.oficinas) || ' oficinas, '
       || (select count(*) from public.usuarios) || ' usuários, '
       || (select count(*) from public.ordens_servico) || ' OS, '
       || (select count(*) from public.os_fotos) || ' fotos'
order by 1, 3;
