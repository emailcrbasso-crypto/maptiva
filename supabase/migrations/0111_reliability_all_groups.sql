-- =====================================================================
-- 0111_reliability_all_groups.sql
--
-- Confiabilidade com todos os grupos do resultado geral.
--
-- get_participant_reliability (0103, 0109) descartava da margem, do
-- limiar e da confiabilidade os grupos com menos de n_minimum pessoas,
-- exceto chefe direto e liderança superior. O BD (PARAMETROS) diz que
-- nenhum grupo é fundido nem suprimido, e a aba CONFIABILIDADE conta
-- todos eles:
--   Fabiana Alves de Lima — Equipe indireta 2: base 28 avaliadores,
--     margem 0,31; o sistema dava 26 e 0,33.
--   Samoel Alves Ferreira — Equipe 1: base 33 avaliadores, margem 0,22,
--     72,7% na Equipe indireta, 9 indiferenciados; o sistema dava 32,
--     0,23, 75% (acendendo um alerta de concentração que a base não
--     tem) e 8.
-- Também mudam José Accacio e Odair (Pares 1).
--
-- n_indiferenciados passa a contar todos os formulários, exceto a
-- autoavaliação, com a mesma nota nas 33 perguntas, inclusive clientes
-- internos, como a coluna "Respostas indiferenciadas" do BD (ex.: Joseph
-- 3, e não 2). A classificação de nenhum dos 16 gestores muda com isso.
--
-- Cole o bloco INTEIRO no SQL Editor, sem nada selecionado, e clique
-- em Run.
-- =====================================================================

create or replace function public.get_participant_reliability(
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
begin
  select c.tenant_id
    into v_tenant_id
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
    with rater_avgs as (
      select
        a.evaluator_cycle_participant_id as rater_id,
        case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end as relationship_code,
        avg(r.score)                     as rater_avg,
        count(distinct r.score)          as distinct_scores,
        count(*)                         as n_responses
      from public.responses   r
      join public.assignments a on a.id = r.assignment_id
      join public.questions   q on q.id = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.relationship_code              not in ('self', 'client')
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by a.evaluator_cycle_participant_id, case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end
    ),
    group_counts as (
      select relationship_code, count(*) as n
      from rater_avgs
      group by relationship_code
    ),
    -- Todos os grupos do resultado geral entram, mesmo com menos de
    -- n_minimum pessoas (BD, PARAMETROS: "Nenhum grupo é fundido nem
    -- suprimido"). Antes, Equipe indireta 2 da Fabiana e Equipe 1 do
    -- Samoel ficavam de fora da margem, do limiar e da confiabilidade.
    eligible_groups as (
      select relationship_code, n
      from group_counts
    ),
    eligible_raters as (
      select ra.*
      from rater_avgs ra
      join eligible_groups eg on eg.relationship_code = ra.relationship_code
    ),
    stats as (
      select
        count(*)                                     as n_avaliadores,
        (select count(*) from eligible_groups)        as n_grupos,
        coalesce(stddev_samp(rater_avg), 0)            as desvio,
        bool_or(relationship_code = 'manager')        as has_chefe,
        bool_or(relationship_code = 'peer')            as has_pares,
        coalesce(
          (select max(n) from eligible_groups)::numeric / nullif(count(*), 0),
          0
        ) as max_group_share
      from eligible_raters
    ),
    -- Todos os avaliadores (inclui clientes internos, exclui autoavaliação)
    -- com uma única nota do início ao fim, pra citar o caso concreto.
    all_indiferenciados as (
      select
        case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end as relationship_code,
        min(r.score)                                      as value
      from public.responses   r
      join public.assignments a on a.id = r.assignment_id
      join public.questions   q on q.id = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.relationship_code              <> 'self'
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by a.evaluator_cycle_participant_id, case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end
      having count(distinct r.score) = 1
    )
    select jsonb_build_object(
      'n_avaliadores',       s.n_avaliadores,
      'n_grupos',            s.n_grupos,
      'desvio_padrao',       round(s.desvio::numeric, 4),
      'margem',              round((1.96 * s.desvio / nullif(sqrt(s.n_avaliadores), 0))::numeric, 4),
      'limiar_leitura',      ceil((1.96 * s.desvio / nullif(sqrt(s.n_avaliadores), 0))::numeric * 10) / 10,
      'n_indiferenciados',   (select count(*) from all_indiferenciados),
      'has_chefe',           s.has_chefe,
      'has_pares',           s.has_pares,
      'max_group_share_pct', round(s.max_group_share * 100, 1),
      'tier',
        case
          when s.n_grupos < 3 or s.n_avaliadores < 15 then 'fragil'
          when not s.has_chefe or not s.has_pares
            or s.max_group_share >= 0.75
            or (select count(*) from all_indiferenciados) >= 3
            or s.n_avaliadores < 20
          then 'atencao'
          else 'bom'
        end,
      'indiferenciados_detail', (
        select coalesce(jsonb_agg(jsonb_build_object('relationship_code', relationship_code, 'value', value)), '[]'::jsonb)
        from all_indiferenciados
      )
    )
    from stats s
  );
end$$;

grant execute on function public.get_participant_reliability(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
