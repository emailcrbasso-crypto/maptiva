-- =====================================================================
-- 0114_escala_6_pontos.sql
--
-- Escala de 6 pontos de concordância, sem ponto neutro (tipo de pergunta
-- "escala_6"), para pesquisas de clima no padrão "mais concordo que discordo":
--
--   1 e 2  pontos críticos
--   3 e 4  oportunidades de melhoria
--   5 e 6  pontos fortes (contam como favoráveis)
--
-- Duas mudanças, ambas aditivas para as pesquisas existentes (escala_5 não muda):
--  1. app.validate_dpa_respostas passa a aceitar notas de 1 a 6 em "escala_6";
--  2. get_dpa_resumo (cartão da página inicial) classifica cada pergunta pela
--     escala dela e informa a escala usada.
-- =====================================================================

-- ── 1. Validação das respostas ───────────────────────────────────────
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
  v_limite        numeric;
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

    if v_tipo in ('escala_5', 'escala_6') then
      v_limite := case when v_tipo = 'escala_6' then 6 else 5 end;
      if jsonb_typeof(v_resposta) not in ('number','string') then
        raise exception 'resposta_invalida: %', v_id using errcode = 'P0411';
      end if;
      v_score := (v_resposta#>>'{}')::numeric;
      if v_score < 1 or v_score > v_limite or v_score <> trunc(v_score) then
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

-- ── 2. Resumo do cartão da página inicial, por escala ────────────────
create or replace function public.get_dpa_resumo(p_projeto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant     uuid;
  v_cfg        jsonb;
  v_authorized boolean;
  v_total      int;
  v_resp       int;
  v_fav        bigint;
  v_neu        bigint;
  v_des        bigint;
  v_n          bigint;
  v_escala     int;
begin
  select tenant_id, config into v_tenant, v_cfg
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

  select count(*), count(*) filter (where status = 'respondido')
    into v_total, v_resp
    from public.dpa_participantes
   where projeto_id = p_projeto_id;

  select case when exists (
           select 1 from jsonb_array_elements(coalesce(v_cfg -> 'perguntas', '[]'::jsonb)) p
            where p ->> 'tipo' = 'escala_6'
         ) then 6 else 5 end
    into v_escala;

  -- 5 pontos: favorável 4-5, neutro 3, desfavorável 1-2.
  -- 6 pontos: favorável 5-6, intermediário 3-4, desfavorável 1-2.
  select count(*) filter (where t.v >= t.maxv - 1),
         count(*) filter (where t.v between 3 and t.maxv - 2),
         count(*) filter (where t.v <= 2)
    into v_fav, v_neu, v_des
    from (
      select case when (r.respostas ->> q.qid) ~ '^[1-6]$'
                  then case when (r.respostas ->> q.qid)::int <= q.maxv
                            then (r.respostas ->> q.qid)::int end
             end as v,
             q.maxv
        from public.dpa_respostas r
       cross join (
         select p ->> 'id' as qid,
                case when p ->> 'tipo' = 'escala_6' then 6 else 5 end as maxv
           from jsonb_array_elements(coalesce(v_cfg -> 'perguntas', '[]'::jsonb)) p
          where p ->> 'tipo' in ('escala_5', 'escala_6')
       ) q
       where r.projeto_id = p_projeto_id
    ) t
   where t.v is not null;

  v_n := v_fav + v_neu + v_des;

  return jsonb_build_object(
    'total_participantes', v_total,
    'total_respondidos',   v_resp,
    'n_respostas',         v_n,
    'escala',              v_escala,
    'favoravel',    case when v_n = 0 then 0 else round(v_fav * 100.0 / v_n, 1) end,
    'neutro',       case when v_n = 0 then 0 else round(v_neu * 100.0 / v_n, 1) end,
    'desfavoravel', case when v_n = 0 then 0 else round(v_des * 100.0 / v_n, 1) end
  );
end
$$;

revoke all on function public.get_dpa_resumo(uuid) from public;
grant execute on function public.get_dpa_resumo(uuid) to authenticated;
