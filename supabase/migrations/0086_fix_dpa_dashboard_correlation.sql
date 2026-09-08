-- =====================================================================
-- 0086_fix_dpa_dashboard_correlation.sql
--
-- Achado #4 da auditoria — confirmado: get_dpa_dashboard devolve as
-- respostas "anônimas" com unidade + respondido_em (timestamp
-- completo), e a MESMA tela do admin carrega a lista de participantes
-- com nome/e-mail/unidade/respondido_em. Dá pra cruzar as duas listas
-- por (unidade, horário) e reidentificar quem respondeu o quê —
-- principalmente em unidades pequenas. Também autorizava qualquer
-- membro ativo do tenant, não só admin/owner.
--
-- Correção:
--  1) Só admin/owner podem chamar get_dpa_dashboard (antes: qualquer
--     membership ativa).
--  2) respondido_em nas respostas individuais vira só a DATA (sem
--     hora/minuto/segundo) — o frontend já só usa a data mesmo
--     (toLocaleDateString no export), então não perde funcionalidade.
--  3) unidade fica NULL na resposta individual quando essa unidade tem
--     menos de 3 RESPONDENTES no projeto — evita identificar alguém
--     numa unidade pequena só pelo corte "unidade + data".
-- =====================================================================

create or replace function public.get_dpa_dashboard(p_projeto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projeto       record;
  v_authorized    boolean;
  v_total         int;
  v_respondidos   int;
  v_por_unidade   jsonb;
  v_respostas     jsonb;
  v_n_min         constant int := 3;
begin
  select id, tenant_id, config
    into v_projeto
    from public.dpa_projetos
   where id = p_projeto_id
   limit 1;

  if not found then
    raise exception 'Projeto não encontrado' using errcode = 'P0404';
  end if;

  -- Só admin/owner do tenant — antes qualquer membership ativa passava,
  -- o que dava acesso a dado quase-identificável pra qualquer gestor.
  select exists (
    select 1
      from public.tenant_memberships tm
      join public.users u on u.id = tm.user_id
     where tm.tenant_id = v_projeto.tenant_id
       and u.auth_user_id = auth.uid()
       and tm.status      = 'active'
       and tm.role in ('admin', 'owner')
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Não autorizado' using errcode = 'P0401';
  end if;

  select count(*), count(*) filter (where status = 'respondido')
    into v_total, v_respondidos
    from public.dpa_participantes
   where projeto_id = p_projeto_id;

  select jsonb_agg(
    jsonb_build_object(
      'unidade',     u.unidade_label,
      'total',       u.total,
      'respondidos', u.respondidos
    )
    order by u.total desc
  )
  into v_por_unidade
  from (
    select
      coalesce(unidade, 'Sem ' || coalesce(v_projeto.config->>'label_unidade', 'unidade')) as unidade_label,
      count(*)                                          as total,
      count(*) filter (where status = 'respondido')     as respondidos
    from public.dpa_participantes
    where projeto_id = p_projeto_id
    group by unidade
  ) u;

  -- Respostas individuais — unidade suprimida (NULL) quando essa unidade
  -- tem menos de v_n_min respondentes; respondido_em só com a data.
  with unidade_counts as (
    select unidade, count(*) filter (where status = 'respondido') as n_respondentes
    from public.dpa_participantes
    where projeto_id = p_projeto_id
    group by unidade
  )
  select jsonb_agg(
    jsonb_build_object(
      'id',            r.id,
      'unidade',       case when coalesce(uc.n_respondentes, 0) >= v_n_min then p.unidade else null end,
      'respondido_em', p.respondido_em::date,
      'respostas',     r.respostas
    )
    order by p.respondido_em desc
  )
  into v_respostas
  from public.dpa_respostas r
  join public.dpa_participantes p on p.id = r.participante_id
  left join unidade_counts uc on uc.unidade is not distinct from p.unidade
  where r.projeto_id = p_projeto_id;

  return jsonb_build_object(
    'total_participantes', v_total,
    'total_respondidos',   v_respondidos,
    'taxa_resposta',       case when v_total = 0 then 0
                                else round((v_respondidos::numeric / v_total * 100), 1)
                           end,
    'label_unidade',       coalesce(v_projeto.config->>'label_unidade', 'Departamento'),
    'por_unidade',         coalesce(v_por_unidade, '[]'::jsonb),
    'respostas',           coalesce(v_respostas,   '[]'::jsonb)
  );
end
$$;

grant execute on function public.get_dpa_dashboard(uuid) to authenticated;
