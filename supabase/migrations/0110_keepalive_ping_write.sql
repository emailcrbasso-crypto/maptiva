-- =====================================================================
-- 0110_keepalive_ping_write.sql
--
-- O ping() de 0060 só lê (select count). O Supabase continuou avisando que o
-- projeto seria pausado por falta de atividade, então o ping passa a gravar
-- uma linha por chamada (escrita real no Postgres) e apaga as antigas para a
-- tabela não crescer. Tabela de infraestrutura: sem dados de negócio e sem
-- acesso de anon/authenticated (RLS ligada, nenhuma policy).
-- =====================================================================

create table if not exists public.keepalive_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.keepalive_log enable row level security;

create or replace function public.ping()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.keepalive_log default values;
  delete from public.keepalive_log where created_at < now() - interval '14 days';
  return jsonb_build_object('ok', true, 'at', now());
end$$;

grant execute on function public.ping() to anon, authenticated;
