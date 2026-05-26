-- =====================================================================
-- 0051_cycle_benchmark_rpc.sql
--
-- public.get_cycle_benchmark(p_cycle_id uuid)
--
-- Retorna a média externa por competência agregada sobre TODOS os
-- participantes do ciclo — serve como linha de referência ("média do
-- grupo") nos relatórios individuais.
--
-- Acesso:
--   - Admin/owner: sempre
--   - Participante: somente após liberação do relatório (report_release_at)
--
-- Retorno: jsonb array de
--   { competency_id: uuid | null, score_avg: numeric, participant_count: int }
-- =====================================================================

create or replace function public.get_cycle_benchmark(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_release_at timestamptz;
  v_is_admin   boolean;
  v_is_participant boolean;
begin
  select c.tenant_id, c.report_release_at
    into v_tenant_id, v_release_at
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then return '[]'::jsonb; end if;

  -- Checar se é admin/owner do tenant correto
  v_is_admin := app.is_admin_or_owner()
                and (app.current_tenant_id() = v_tenant_id
                     or app.current_tenant_id() is null);

  -- Checar se é participante do ciclo com relatório liberado
  v_is_participant := (
    v_release_at is not null
    and v_release_at <= now()
    and app.current_tenant_id() = v_tenant_id
    and exists (
      select 1
      from public.cycle_participants cp
      join public.people pe on pe.id = cp.person_id
      join public.users  u  on u.id  = pe.user_id
      where cp.cycle_id    = p_cycle_id
        and u.auth_user_id = auth.uid()
    )
  );

  if not (v_is_admin or v_is_participant) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'competency_id',     competency_id,
        'score_avg',         round(avg_score::numeric, 4),
        'participant_count', part_count
      )
    )
    from (
      select
        ss.competency_id,
        avg(ss.score_avg)           as avg_score,
        count(distinct ss.cycle_participant_id)::int as part_count
      from public.score_snapshots ss
      where ss.cycle_id        = p_cycle_id
        and ss.visibility_status = 'visible'
        and ss.relationship_code != 'self'
        and ss.score_avg         is not null
      group by ss.competency_id
    ) agg
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_cycle_benchmark(uuid) to authenticated;
