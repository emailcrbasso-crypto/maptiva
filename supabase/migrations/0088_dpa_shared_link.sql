-- =====================================================================
-- 0088_dpa_shared_link.sql
--
-- Modo "link compartilhado" pro InSight/DPA — um link único do PROJETO
-- (não do participante) que qualquer pessoa abre, responde e some, sem
-- cadastro, sem nome, sem e-mail. Cada resposta entra anônima
-- (participante_id = NULL). Pedido específico de um cliente que quer
-- distribuir o link internamente; assume os riscos de duplicidade e de
-- não poder mandar lembrete pra quem não respondeu.
--
-- Fica DESLIGADO por padrão em todo projeto — só liga quando
-- dpa_projetos.shared_link_token é preenchido.
-- =====================================================================

-- ── Schema ────────────────────────────────────────────────────────────
alter table public.dpa_projetos
  add column if not exists shared_link_token uuid unique;

-- Resposta anônima de verdade não tem participante.
alter table public.dpa_respostas
  alter column participante_id drop not null;

-- A trava anti-duplicidade (0085) continua valendo pros links
-- individuais, mas não se aplica ao link aberto (participante_id NULL).
alter table public.dpa_respostas
  drop constraint if exists dpa_respostas_participante_unique;

create unique index if not exists dpa_respostas_participante_unique
  on public.dpa_respostas (participante_id)
  where participante_id is not null;

-- ── Helper compartilhado de validação ────────────────────────────────
-- Extrai a validação server-side (obrigatoriedade, opções válidas, nota
-- 1-5, limite de escolhas) pra ser reusada pelos dois fluxos de submit —
-- individual e link compartilhado — sem duplicar a regra.
create or replace function app.validate_dpa_respostas(p_config jsonb, p_respostas jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pergunta      jsonb;
  v_resposta      jsonb;
  v_tipo          text;
  v_obrig         boolean;
  v_multi         boolean;
  v_max           int;
  v_permite_outro boolean;
  v_opcoes        jsonb;
  v_id            text;
  v_is_empty      boolean;
  v_item          jsonb;
  v_score         numeric;
  v_valido        boolean;
begin
  for v_pergunta in
    select * from jsonb_array_elements(coalesce(p_config->'perguntas', '[]'::jsonb))
  loop
    v_id            := v_pergunta->>'id';
    v_tipo          := v_pergunta->>'tipo';
    v_obrig         := coalesce((v_pergunta->>'obrigatoria')::boolean, false);
    v_multi         := coalesce((v_pergunta->>'multi')::boolean, false);
    v_max           := nullif(v_pergunta->>'max_escolhas', '')::int;
    v_permite_outro := coalesce((v_pergunta->>'permite_outro')::boolean, false);
    v_opcoes        := coalesce(v_pergunta->'opcoes', '[]'::jsonb);
    v_resposta      := p_respostas->v_id;

    v_is_empty := v_resposta is null
      or v_resposta = 'null'::jsonb
      or (jsonb_typeof(v_resposta) = 'string' and (v_resposta#>>'{}') = '')
      or (jsonb_typeof(v_resposta) = 'array' and jsonb_array_length(v_resposta) = 0);

    if v_obrig and v_is_empty then
      raise exception 'resposta_obrigatoria_ausente: %', v_id using errcode = 'P0410';
    end if;

    if v_is_empty then
      continue;
    end if;

    if v_tipo = 'escala_5' then
      if jsonb_typeof(v_resposta) not in ('number','string') then
        raise exception 'resposta_invalida: %', v_id using errcode = 'P0411';
      end if;
      v_score := (v_resposta#>>'{}')::numeric;
      if v_score < 1 or v_score > 5 or v_score <> trunc(v_score) then
        raise exception 'nota_fora_do_intervalo: % = %', v_id, v_score using errcode = 'P0412';
      end if;

    elsif v_tipo = 'multipla_escolha' then
      if v_multi then
        if jsonb_typeof(v_resposta) <> 'array' then
          raise exception 'resposta_invalida: %', v_id using errcode = 'P0411';
        end if;
        if v_max is not null and jsonb_array_length(v_resposta) > v_max then
          raise exception 'excesso_de_escolhas: % (max %)', v_id, v_max using errcode = 'P0413';
        end if;
        for v_item in select * from jsonb_array_elements(v_resposta) loop
          v_valido := (v_opcoes @> v_item)
            or (v_permite_outro and (v_item#>>'{}') like 'Outro:%');
          if not v_valido then
            raise exception 'opcao_invalida: % = %', v_id, v_item#>>'{}' using errcode = 'P0414';
          end if;
        end loop;
      else
        if jsonb_typeof(v_resposta) <> 'string' then
          raise exception 'resposta_invalida: %', v_id using errcode = 'P0411';
        end if;
        v_valido := (v_opcoes @> v_resposta)
          or (v_permite_outro and (v_resposta#>>'{}') like 'Outro:%');
        if not v_valido then
          raise exception 'opcao_invalida: % = %', v_id, v_resposta#>>'{}' using errcode = 'P0414';
        end if;
      end if;

    elsif v_tipo = 'texto_livre' then
      if jsonb_typeof(v_resposta) <> 'string' then
        raise exception 'resposta_invalida: %', v_id using errcode = 'P0411';
      end if;
    end if;
  end loop;
end
$$;

-- ── submit_dpa_response (individual) — agora usa o helper ─────────────
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
    part.id, part.status, part.projeto_id, part.tenant_id,
    proj.status as projeto_status, proj.config as projeto_config
  into v_part
  from public.dpa_participantes part
  join public.dpa_projetos proj on proj.id = part.projeto_id
  where part.token = p_token
  limit 1
  for update of part;

  if not found then
    raise exception 'Token inválido' using errcode = 'P0401';
  end if;
  if v_part.projeto_status != 'ativo' then
    raise exception 'Projeto não está ativo' using errcode = 'P0403';
  end if;
  if v_part.status = 'respondido' then
    raise exception 'Participante já respondeu' using errcode = 'P0409';
  end if;

  perform app.validate_dpa_respostas(v_part.projeto_config, p_respostas);

  insert into public.dpa_respostas(participante_id, projeto_id, tenant_id, respostas)
  values (v_part.id, v_part.projeto_id, v_part.tenant_id, p_respostas);

  update public.dpa_participantes
     set status = 'respondido', respondido_em = now()
   where id = v_part.id;

  return jsonb_build_object('sucesso', true);
end
$$;

grant execute on function public.submit_dpa_response(uuid, jsonb) to anon, authenticated;

-- ── validate_dpa_shared_token ────────────────────────────────────────
create or replace function public.validate_dpa_shared_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proj record;
begin
  select id, nome, descricao, status, config
  into v_proj
  from public.dpa_projetos
  where shared_link_token = p_token
  limit 1;

  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'token_invalido');
  end if;
  if v_proj.status = 'rascunho' then
    return jsonb_build_object('valido', false, 'motivo', 'projeto_inativo');
  end if;
  if v_proj.status = 'encerrado' then
    return jsonb_build_object('valido', false, 'motivo', 'projeto_encerrado');
  end if;

  return jsonb_build_object(
    'valido',            true,
    'projeto_id',        v_proj.id,
    'projeto_nome',      v_proj.nome,
    'projeto_descricao', v_proj.descricao,
    'config',            v_proj.config
  );
end
$$;

grant execute on function public.validate_dpa_shared_token(uuid) to anon, authenticated;

-- ── submit_dpa_shared_response ───────────────────────────────────────
-- Sem lock, sem flip de status, sem trava de duplicidade — é um link
-- aberto por definição. participante_id fica NULL (resposta anônima).
create or replace function public.submit_dpa_shared_response(
  p_token     uuid,
  p_respostas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proj record;
begin
  select id, tenant_id, status, config
  into v_proj
  from public.dpa_projetos
  where shared_link_token = p_token
  limit 1;

  if not found then
    raise exception 'Token inválido' using errcode = 'P0401';
  end if;
  if v_proj.status != 'ativo' then
    raise exception 'Projeto não está ativo' using errcode = 'P0403';
  end if;

  perform app.validate_dpa_respostas(v_proj.config, p_respostas);

  insert into public.dpa_respostas(participante_id, projeto_id, tenant_id, respostas)
  values (null, v_proj.id, v_proj.tenant_id, p_respostas);

  return jsonb_build_object('sucesso', true);
end
$$;

grant execute on function public.submit_dpa_shared_response(uuid, jsonb) to anon, authenticated;

-- ── get_dpa_dashboard — inclui respostas anônimas + flag de modo ─────
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
  v_total_respostas int;
  v_por_unidade   jsonb;
  v_respostas     jsonb;
  v_n_min         constant int := 3;
begin
  select id, tenant_id, config, shared_link_token
    into v_projeto
    from public.dpa_projetos
   where id = p_projeto_id
   limit 1;

  if not found then
    raise exception 'Projeto não encontrado' using errcode = 'P0404';
  end if;

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

  select count(*) into v_total_respostas
    from public.dpa_respostas where projeto_id = p_projeto_id;

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

  with unidade_counts as (
    select unidade, count(*) filter (where status = 'respondido') as n_respondentes
    from public.dpa_participantes
    where projeto_id = p_projeto_id
    group by unidade
  )
  select jsonb_agg(
    jsonb_build_object(
      'id',            r.id,
      -- unidade só quando >= n_min respondentes nessa unidade; respostas
      -- do link compartilhado não têm participante, então unidade = null.
      'unidade',       case when p.id is not null and coalesce(uc.n_respondentes, 0) >= v_n_min
                            then p.unidade else null end,
      'respondido_em', coalesce(p.respondido_em, r.created_at)::date,
      'respostas',     r.respostas
    )
    order by coalesce(p.respondido_em, r.created_at) desc
  )
  into v_respostas
  from public.dpa_respostas r
  left join public.dpa_participantes p on p.id = r.participante_id
  left join unidade_counts uc on uc.unidade is not distinct from p.unidade
  where r.projeto_id = p_projeto_id;

  return jsonb_build_object(
    'modo_compartilhado',  (v_projeto.shared_link_token is not null),
    'total_participantes', v_total,
    'total_respondidos',   v_respondidos,
    'total_respostas',     v_total_respostas,
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
