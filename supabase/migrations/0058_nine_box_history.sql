-- =====================================================================
-- 0058_nine_box_history.sql
--
-- Trajetória do colaborador no Nine Box entre ciclos.
-- Dado um participante (cycle_participant) em um ciclo, encontra a mesma
-- pessoa (person_id) em todos os ciclos do tenant que já têm posição
-- calculada, ordenado cronologicamente. Alimenta o cartão individual.
-- =====================================================================

create or replace function app.get_participant_nine_box_history(
  p_cycle_id uuid,
  p_cp_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_person_id uuid;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  select person_id into v_person_id
  from public.cycle_participants where id = p_cp_id;
  if not found then
    raise exception 'participant_not_found' using errcode = 'P0013';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cycle_id',    c.id,
      'cycle_name',  c.name,
      'is_current',  (c.id = p_cycle_id),
      'perf_value',  nb.perf_value,
      'pot_value',   nb.pot_value,
      'perf_band',   coalesce(nb.cal_perf_band, nb.auto_perf_band),
      'pot_band',    coalesce(nb.cal_pot_band,  nb.auto_pot_band),
      'calibrated',  (nb.cal_perf_band is not null or nb.cal_pot_band is not null),
      'computed_at', nb.computed_at,
      'cycle_at',    coalesce(c.start_at, c.created_at)
    ) order by coalesce(c.start_at, c.created_at))
    from public.participant_nine_box nb
    join public.cycle_participants cp on cp.id = nb.cycle_participant_id
    join public.cycles c on c.id = nb.cycle_id
    where cp.person_id = v_person_id
      and nb.tenant_id = v_tenant_id
      and (nb.perf_value is not null or nb.pot_value is not null)
  ), '[]'::jsonb);
end$$;

grant execute on function app.get_participant_nine_box_history(uuid, uuid) to authenticated;

create or replace function public.get_participant_nine_box_history(p_cycle_id uuid, p_cp_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_participant_nine_box_history(p_cycle_id, p_cp_id); end$$;

grant execute on function public.get_participant_nine_box_history(uuid, uuid) to authenticated;
