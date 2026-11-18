-- =====================================================================
-- 0112_dpa_segmentos_participacao.sql
--
-- get_dpa_dashboard_segmentos passa a devolver também a participação
-- (participantes e respondentes) agregada por empresa × área × unidade, para o
-- painel mostrar "Participação por empresa/área/base" e respeitar os filtros.
-- Só agregados (no máximo algumas dezenas de linhas), sem dados individuais.
-- Mesma assinatura e mesmas regras de acesso (admin/owner). Aditiva.
-- =====================================================================

create or replace function public.get_dpa_dashboard_segmentos(p_projeto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant      uuid;
  v_authorized  boolean;
  v_respostas   jsonb;
  v_participacao jsonb;
begin
  select tenant_id into v_tenant
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

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',            r.id,
      'unidade',       p.unidade,
      'empresa',       p.empresa,
      'area',          p.area,
      'respondido_em', coalesce(p.respondido_em, r.created_at)::date,
      'respostas',     r.respostas
    )
    order by coalesce(p.respondido_em, r.created_at) desc
  ), '[]'::jsonb)
  into v_respostas
  from public.dpa_respostas r
  left join public.dpa_participantes p on p.id = r.participante_id
  where r.projeto_id = p_projeto_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'empresa',     t.empresa,
      'area',        t.area,
      'unidade',     t.unidade,
      'total',       t.total,
      'respondidos', t.respondidos
    )
  ), '[]'::jsonb)
  into v_participacao
  from (
    select empresa, area, unidade,
           count(*)                                      as total,
           count(*) filter (where status = 'respondido') as respondidos
      from public.dpa_participantes
     where projeto_id = p_projeto_id
     group by empresa, area, unidade
  ) t;

  return jsonb_build_object('respostas', v_respostas, 'participacao', v_participacao);
end
$$;

revoke all on function public.get_dpa_dashboard_segmentos(uuid) from public;
grant execute on function public.get_dpa_dashboard_segmentos(uuid) to authenticated;
