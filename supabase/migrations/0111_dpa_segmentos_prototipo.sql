-- =====================================================================
-- 0111_dpa_segmentos_prototipo.sql
--
-- PROTÓTIPO de segmentação (grupo de empresas): cada participante passa a ter
-- empresa e área de atuação, além da unidade (base) que já existia, e uma
-- função separada devolve as respostas com esses campos para o painel filtrar.
--
-- Cuidados:
--  * Aditiva: só colunas novas e uma função nova. get_dpa_dashboard NÃO é
--    alterada (outros clientes dependem dela).
--  * A função nova devolve respostas individuais com empresa/área/unidade SEM
--    aplicar o mínimo de respondentes — o painel aplica no navegador. Por isso
--    é restrita a admin/owner e NÃO deve ser exposta a cliente real. A versão de
--    produção calcula os agregados no servidor, com mínimo por combinação de
--    filtros (ver memória do projeto Setti Braga).
-- =====================================================================

alter table public.dpa_participantes
  add column if not exists empresa text,
  add column if not exists area    text;

create index if not exists dpa_participantes_empresa_idx
  on public.dpa_participantes (projeto_id, empresa);

create or replace function public.get_dpa_dashboard_segmentos(p_projeto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant     uuid;
  v_authorized boolean;
  v_respostas  jsonb;
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

  return jsonb_build_object('respostas', v_respostas);
end
$$;

revoke all on function public.get_dpa_dashboard_segmentos(uuid) from public;
grant execute on function public.get_dpa_dashboard_segmentos(uuid) to authenticated;
