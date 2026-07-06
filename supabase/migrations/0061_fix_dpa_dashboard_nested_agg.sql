-- =====================================================================
-- 0061_fix_dpa_dashboard_nested_agg.sql
--
-- Corrige erro "aggregate function calls cannot be nested" no dashboard
-- do DPA. O passo "Por unidade" fazia jsonb_agg(... count(*) ...) — dois
-- agregados aninhados. Solução: agregar count(*) por unidade num subselect
-- e aplicar jsonb_agg sobre o resultado.
--
-- Recria public.get_dpa_dashboard (última versão em 0048); apenas o passo 4
-- muda, o restante é idêntico.
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
begin
  -- 1. Encontra o projeto pelo ID (sem filtro de tenant — verificamos abaixo)
  select id, tenant_id, config
    into v_projeto
    from public.dpa_projetos
   where id = p_projeto_id
   limit 1;

  if not found then
    raise exception 'Projeto não encontrado' using errcode = 'P0404';
  end if;

  -- 2. Verifica que o chamador é membro ativo do tenant dono do projeto.
  select exists (
    select 1
      from public.tenant_memberships tm
      join public.users u on u.id = tm.user_id
     where tm.tenant_id = v_projeto.tenant_id
       and u.auth_user_id = auth.uid()
       and tm.status      = 'active'
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Não autorizado' using errcode = 'P0401';
  end if;

  -- 3. Contagens
  select count(*), count(*) filter (where status = 'respondido')
    into v_total, v_respondidos
    from public.dpa_participantes
   where projeto_id = p_projeto_id;

  -- 4. Por unidade — agrega count(*) por unidade PRIMEIRO (subselect),
  --    depois aplica jsonb_agg (evita agregados aninhados).
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

  -- 5. Respostas individuais (sem email/nome — apenas unidade + respostas)
  select jsonb_agg(
    jsonb_build_object(
      'id',            r.id,
      'unidade',       p.unidade,
      'respondido_em', p.respondido_em,
      'respostas',     r.respostas
    )
    order by p.respondido_em desc
  )
  into v_respostas
  from public.dpa_respostas r
  join public.dpa_participantes p on p.id = r.participante_id
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
