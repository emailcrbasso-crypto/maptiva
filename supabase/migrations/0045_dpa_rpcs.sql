-- 0045_dpa_rpcs.sql
--
-- RPCs para o módulo DPA.
--
-- Funções públicas (anon + authenticated):
--   validate_dpa_token  — valida token e retorna config do projeto
--   submit_dpa_response — grava respostas e marca participante como respondido
--
-- Funções admin (authenticated only, RLS aplicada):
--   get_dpa_dashboard   — estatísticas agregadas por projeto

-- ── 1. validate_dpa_token ─────────────────────────────────────────────────────

create or replace function public.validate_dpa_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part  record;
begin
  select
    part.id,
    part.nome,
    part.unidade,
    part.status,
    proj.id         as projeto_id,
    proj.nome       as projeto_nome,
    proj.descricao  as projeto_descricao,
    proj.status     as projeto_status,
    proj.config
  into v_part
  from public.dpa_participantes part
  join public.dpa_projetos proj on proj.id = part.projeto_id
  where part.token = p_token
  limit 1;

  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'token_invalido');
  end if;

  if v_part.projeto_status = 'rascunho' then
    return jsonb_build_object('valido', false, 'motivo', 'projeto_inativo');
  end if;

  if v_part.projeto_status = 'encerrado' then
    return jsonb_build_object('valido', false, 'motivo', 'projeto_encerrado');
  end if;

  if v_part.status = 'respondido' then
    return jsonb_build_object('valido', false, 'motivo', 'ja_respondido');
  end if;

  return jsonb_build_object(
    'valido',            true,
    'participante_id',   v_part.id,
    'nome',              v_part.nome,
    'unidade',           v_part.unidade,
    'projeto_id',        v_part.projeto_id,
    'projeto_nome',      v_part.projeto_nome,
    'projeto_descricao', v_part.projeto_descricao,
    'config',            v_part.config
  );
end
$$;

grant execute on function public.validate_dpa_token(uuid) to anon, authenticated;

-- ── 2. submit_dpa_response ────────────────────────────────────────────────────

create or replace function public.submit_dpa_response(
  p_token     uuid,
  p_respostas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part record;
begin
  select
    part.id,
    part.status,
    part.projeto_id,
    part.tenant_id,
    proj.status as projeto_status
  into v_part
  from public.dpa_participantes part
  join public.dpa_projetos proj on proj.id = part.projeto_id
  where part.token = p_token
  limit 1;

  if not found then
    raise exception 'Token inválido' using errcode = 'P0401';
  end if;

  if v_part.projeto_status != 'ativo' then
    raise exception 'Projeto não está ativo' using errcode = 'P0403';
  end if;

  if v_part.status = 'respondido' then
    raise exception 'Participante já respondeu' using errcode = 'P0409';
  end if;

  -- Insert response record
  insert into public.dpa_respostas(participante_id, projeto_id, tenant_id, respostas)
  values (v_part.id, v_part.projeto_id, v_part.tenant_id, p_respostas);

  -- Mark participant as answered
  update public.dpa_participantes
     set status        = 'respondido',
         respondido_em = now()
   where id = v_part.id;

  return jsonb_build_object('sucesso', true);
end
$$;

grant execute on function public.submit_dpa_response(uuid, jsonb) to anon, authenticated;

-- ── 3. get_dpa_dashboard ──────────────────────────────────────────────────────
--
-- Returns:
-- {
--   "total_participantes": 50,
--   "total_respondidos": 32,
--   "taxa_resposta": 64.0,
--   "label_unidade": "Departamento",
--   "por_unidade": [
--     { "unidade": "TI", "total": 10, "respondidos": 8 }
--   ],
--   "respostas": [
--     {
--       "participante_id": "...",
--       "unidade": "TI",
--       "respondido_em": "2025-01-15T...",
--       "respostas": { "q1": 4, "q2": "..." }
--     }
--   ]
-- }

create or replace function public.get_dpa_dashboard(p_projeto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projeto       record;
  v_tenant_id     uuid;
  v_total         int;
  v_respondidos   int;
  v_por_unidade   jsonb;
  v_respostas     jsonb;
begin
  -- Load project (also validates tenant via RLS workaround)
  select id, tenant_id, config
    into v_projeto
    from public.dpa_projetos
   where id = p_projeto_id
     and tenant_id = app.current_tenant_id()
   limit 1;

  if not found then
    raise exception 'Projeto não encontrado' using errcode = 'P0404';
  end if;

  -- Counts
  select count(*), count(*) filter (where status = 'respondido')
    into v_total, v_respondidos
    from public.dpa_participantes
   where projeto_id = p_projeto_id;

  -- Per-unit breakdown
  select jsonb_agg(
    jsonb_build_object(
      'unidade',     coalesce(unidade, 'Sem ' || (v_projeto.config->>'label_unidade')),
      'total',       count(*),
      'respondidos', count(*) filter (where status = 'respondido')
    )
    order by count(*) desc
  )
  into v_por_unidade
  from public.dpa_participantes
  where projeto_id = p_projeto_id
  group by unidade;

  -- Individual responses (de-identified — no email, no nome)
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
    'respostas',           coalesce(v_respostas, '[]'::jsonb)
  );
end
$$;

-- Only authenticated users can call this (tenant isolation via current_tenant_id inside)
grant execute on function public.get_dpa_dashboard(uuid) to authenticated;
