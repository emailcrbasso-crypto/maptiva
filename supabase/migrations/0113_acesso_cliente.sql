-- =====================================================================
-- 0113_acesso_cliente.sql
--
-- "Acesso de cliente": marca um vínculo (usuário x espaço) como restrito, para
-- a interface mostrar só o painel e as pesquisas e esconder a administração.
--
-- IMPORTANTE: isto é uma restrição de INTERFACE. O papel do usuário no banco não
-- muda (continua admin), então não protege contra quem chame a API por fora da
-- tela. Serve para a demonstração com dados fictícios. Com dados reais, o acesso
-- do cliente deve ser um papel de leitura imposto pelo banco (RLS).
--
-- Aditiva: uma coluna com padrão false e duas funções novas.
-- =====================================================================

alter table public.tenant_memberships
  add column if not exists acesso_restrito boolean not null default false;

-- O front pergunta se o usuário logado é restrito no espaço atual.
create or replace function public.get_my_access(p_tenant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'restrito',
    coalesce((
      select tm.acesso_restrito
        from public.tenant_memberships tm
        join public.users u on u.id = tm.user_id
       where tm.tenant_id = p_tenant_id
         and u.auth_user_id = auth.uid()
         and tm.status = 'active'
       limit 1
    ), false)
  )
$$;

revoke all on function public.get_my_access(uuid) from public;
grant execute on function public.get_my_access(uuid) to authenticated;

-- Resumo leve de uma pesquisa para o cartão da página inicial: participação e
-- favorabilidade geral, calculadas no banco (sem trazer respostas ao navegador).
create or replace function public.get_dpa_resumo(p_projeto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant     uuid;
  v_cfg        jsonb;
  v_authorized boolean;
  v_total      int;
  v_resp       int;
  v_fav        bigint;
  v_neu        bigint;
  v_des        bigint;
  v_n          bigint;
begin
  select tenant_id, config into v_tenant, v_cfg
    from public.dpa_projetos
   where id = p_projeto_id;

  if v_tenant is null then
    raise exception 'Projeto não encontrado' using errcode = 'P0404';
  end if;

  select exists (
    select 1
      from public.tenant_memberships tm
      join public.users u on u.id = tm.user_id
     where tm.tenant_id = v_tenant
       and u.auth_user_id = auth.uid()
       and tm.status = 'active'
       and tm.role in ('admin', 'owner')
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Não autorizado' using errcode = 'P0401';
  end if;

  select count(*), count(*) filter (where status = 'respondido')
    into v_total, v_resp
    from public.dpa_participantes
   where projeto_id = p_projeto_id;

  select count(*) filter (where t.v in (4, 5)),
         count(*) filter (where t.v = 3),
         count(*) filter (where t.v in (1, 2))
    into v_fav, v_neu, v_des
    from (
      select case when (r.respostas ->> q.qid) ~ '^[1-5]$'
                  then (r.respostas ->> q.qid)::int end as v
        from public.dpa_respostas r
       cross join (
         select p ->> 'id' as qid
           from jsonb_array_elements(coalesce(v_cfg -> 'perguntas', '[]'::jsonb)) p
          where p ->> 'tipo' = 'escala_5'
       ) q
       where r.projeto_id = p_projeto_id
    ) t;

  v_n := v_fav + v_neu + v_des;

  return jsonb_build_object(
    'total_participantes', v_total,
    'total_respondidos',   v_resp,
    'n_respostas',         v_n,
    'favoravel',    case when v_n = 0 then 0 else round(v_fav * 100.0 / v_n, 1) end,
    'neutro',       case when v_n = 0 then 0 else round(v_neu * 100.0 / v_n, 1) end,
    'desfavoravel', case when v_n = 0 then 0 else round(v_des * 100.0 / v_n, 1) end
  );
end
$$;

revoke all on function public.get_dpa_resumo(uuid) from public;
grant execute on function public.get_dpa_resumo(uuid) to authenticated;
