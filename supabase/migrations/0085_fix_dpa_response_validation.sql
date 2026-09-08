-- =====================================================================
-- 0085_fix_dpa_response_validation.sql
--
-- Duas falhas reais confirmadas em submit_dpa_response (0045):
--
-- 1) Gravava o JSON recebido sem validar nada contra o config do
--    projeto (pergunta obrigatória ausente, opção fora da lista,
--    excesso de escolhas em múltipla escolha, nota fora de 1-5).
--    A validação só existia no navegador, e é trivialmente contornável.
--
-- 2) Não havia lock de linha nem constraint única — duas requisições
--    simultâneas com o mesmo token podiam passar o "já respondeu" antes
--    de qualquer uma commitar, gravando 2 linhas em dpa_respostas.
--
-- Correção:
--  - SELECT ... FOR UPDATE no participante antes de checar o status,
--    serializando submissões concorrentes do mesmo token.
--  - UNIQUE em dpa_respostas(participante_id) como cinto e suspensório
--    (garante no nível do banco, mesmo se o lock falhar por algum motivo).
--  - Validação server-side de cada pergunta contra proj.config:
--    obrigatoriedade, opções válidas (com suporte a "Outro: <texto>"
--    quando permite_outro), limite de max_escolhas, nota 1-5 em escala.
-- =====================================================================

-- Backstop no banco — se já existir duplicata (não deveria, mas por via
-- das dúvidas), mantém só a resposta mais antiga antes de criar o índice.
delete from public.dpa_respostas a
using public.dpa_respostas b
where a.participante_id = b.participante_id
  and a.id > b.id;

alter table public.dpa_respostas
  add constraint dpa_respostas_participante_unique unique (participante_id);

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
  v_part      record;
  v_pergunta  jsonb;
  v_resposta  jsonb;
  v_tipo      text;
  v_obrig     boolean;
  v_multi     boolean;
  v_max       int;
  v_permite_outro boolean;
  v_opcoes    jsonb;
  v_id        text;
  v_is_empty  boolean;
  v_item      jsonb;
  v_score     numeric;
  v_valido    boolean;
begin
  select
    part.id,
    part.status,
    part.projeto_id,
    part.tenant_id,
    proj.status as projeto_status,
    proj.config as projeto_config
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

  -- ── Validação server-side contra o config do projeto ──────────────
  for v_pergunta in
    select * from jsonb_array_elements(coalesce(v_part.projeto_config->'perguntas', '[]'::jsonb))
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
      continue; -- não obrigatória e vazia — nada mais a validar
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
