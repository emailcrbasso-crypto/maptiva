-- =====================================================================
-- 0074_relationship_detail_favorability.sql
--
-- RPC dedicado pra favorabilidade quebrada por (relationship_code,
-- relationship_detail) — ex.: 'Pares Direto', 'Pares Indireto',
-- 'Equipe Direta', 'Equipe Indireta', 'Auto Avaliação' — em vez do
-- corte coarse (self/manager/peer/subordinate) que funde Direto e
-- Indireto na mesma linha. Usa a terminologia exata que o cliente já
-- reconhece do modelo deles, evitando confundir a leitura.
--
-- N-mínimo aplicado por avaliadores DISTINTOS em cada grupo
-- (relationship_code, relationship_detail) — mesma regra de anonimato
-- do resto do produto. self sempre visível.
-- =====================================================================

create or replace function app.get_participant_relationship_favorability(
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
  v_n_min     int;
begin
  select c.tenant_id, t.n_minimum_default
    into v_tenant_id, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  return (
    with raw_responses as (
      select
        a.evaluator_cycle_participant_id,
        a.relationship_code,
        a.relationship_detail,
        r.score
      from public.assignments a
      join public.responses   r on r.assignment_id = a.id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.status                         = 'completed'
        and r.score is not null
    ),
    rater_counts as (
      select relationship_code, relationship_detail,
             count(distinct evaluator_cycle_participant_id) as n_raters
      from raw_responses
      group by relationship_code, relationship_detail
    ),
    grouped_dist as (
      select
        relationship_code, relationship_detail,
        jsonb_object_agg(score::int::text, cnt) as distribution,
        sum(cnt)                                as response_count
      from (
        select relationship_code, relationship_detail, score::int as score, count(*) as cnt
        from raw_responses
        group by relationship_code, relationship_detail, score
      ) buckets
      group by relationship_code, relationship_detail
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'relationship_code',   gd.relationship_code,
        'relationship_detail', gd.relationship_detail,
        'distribution',        gd.distribution,
        'response_count',      gd.response_count,
        'rater_count',         rc.n_raters
      ) order by gd.relationship_code, gd.relationship_detail
    ), '[]'::jsonb)
    from grouped_dist gd
    join rater_counts rc
      on rc.relationship_code = gd.relationship_code
     and rc.relationship_detail is not distinct from gd.relationship_detail
    where gd.relationship_code = 'self' or rc.n_raters >= v_n_min
  );
end$$;

grant execute on function app.get_participant_relationship_favorability(uuid, uuid) to authenticated;

create or replace function public.get_participant_relationship_favorability(p_cycle_id uuid, p_cp_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_participant_relationship_favorability(p_cycle_id, p_cp_id); end$$;

grant execute on function public.get_participant_relationship_favorability(uuid, uuid) to authenticated;
