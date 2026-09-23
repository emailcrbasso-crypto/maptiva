-- =====================================================================
-- 0106_reliability_indiferenciados_detail.sql
--
-- Metodologia do relatório-modelo cita o caso concreto: "1 formulário
-- deste relatório veio com a mesma marcação nas 33 perguntas, de
-- clientes internos, com Frequente." get_participant_reliability só
-- contava indiferenciados dentro do resultado geral (chefe/lid. sup./
-- pares/equipe), que é a base certa para o tier de confiabilidade — mas
-- não dá pra citar o caso concreto porque clientes internos ficam de
-- fora dessa contagem.
--
-- Adiciona 'indiferenciados_detail': varre TODOS os avaliadores (exceto
-- autoavaliação, incluindo clientes internos) por formulários com uma
-- única nota do início ao fim, e devolve o grupo + a nota. Não expõe
-- identidade — só grupo (com n >= 1, mesmo padrão já usado no resto do
-- relatório pra chefe direto/liderança superior) e o valor constante.
-- =====================================================================

begin;

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
    with rater_avgs as (
      select
        a.evaluator_cycle_participant_id as rater_id,
        a.relationship_code              as relationship_code,
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
      group by a.evaluator_cycle_participant_id, a.relationship_code
    ),
    group_counts as (
      select relationship_code, count(*) as n
      from rater_avgs
      group by relationship_code
    ),
    eligible_groups as (
      select relationship_code, n
      from group_counts
      where relationship_code in ('manager', 'manager_superior') or n >= v_n_min
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
        count(*) filter (where distinct_scores = 1)   as n_indiferenciados,
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
        a.relationship_code                              as relationship_code,
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
      group by a.evaluator_cycle_participant_id, a.relationship_code
      having count(distinct r.score) = 1
    )
    select jsonb_build_object(
      'n_avaliadores',       s.n_avaliadores,
      'n_grupos',            s.n_grupos,
      'desvio_padrao',       round(s.desvio::numeric, 4),
      'margem',              round((1.96 * s.desvio / nullif(sqrt(s.n_avaliadores), 0))::numeric, 4),
      'limiar_leitura',      ceil((1.96 * s.desvio / nullif(sqrt(s.n_avaliadores), 0))::numeric * 10) / 10,
      'n_indiferenciados',   s.n_indiferenciados,
      'has_chefe',           s.has_chefe,
      'has_pares',           s.has_pares,
      'max_group_share_pct', round(s.max_group_share * 100, 1),
      'tier',
        case
          when s.n_grupos < 3 or s.n_avaliadores < 15 then 'fragil'
          when not s.has_chefe or not s.has_pares
            or s.max_group_share >= 0.75
            or s.n_indiferenciados >= 3
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

commit;
