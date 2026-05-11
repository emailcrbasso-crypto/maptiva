-- ============================================================
-- scripts/seed_dev_account.sql
--
-- Provisiona tenant + membership para a conta de desenvolvimento.
-- Execute no SQL Editor do Supabase (roda como postgres, bypass RLS).
-- Idempotente: pode rodar mais de uma vez sem duplicar dados.
-- ============================================================

do $$
declare
  v_auth_id   uuid;
  v_user_id   uuid;
  v_tenant_id uuid;
  v_tmpl_id   uuid;
begin

  -- ── 1. Localiza auth user ──────────────────────────────────
  select id into v_auth_id
  from auth.users
  where email = 'rafaelmedeiros@crbasso.com.br';

  if v_auth_id is null then
    raise exception
      'Auth user não encontrado. Verifique o e-mail ou crie a conta primeiro.';
  end if;

  -- ── 2. Garante public.users (trigger pode não ter rodado em migração anterior) ──
  select id into v_user_id
  from public.users
  where auth_user_id = v_auth_id;

  if v_user_id is null then
    insert into public.users (auth_user_id, email, name)
    values (v_auth_id, 'rafaelmedeiros@crbasso.com.br', 'Rafael Medeiros')
    returning id into v_user_id;
    raise notice 'public.users criado: %', v_user_id;
  else
    raise notice 'public.users já existe: %', v_user_id;
  end if;

  -- ── 3. Cria tenant (idempotente por slug) ─────────────────
  insert into public.tenants (name, slug, plan_code, locale, timezone, status)
  values ('CRBasso Consultoria', 'crbasso', 'trial', 'pt-BR', 'America/Sao_Paulo', 'active')
  on conflict (slug) do update
    set name   = excluded.name,
        status = 'active'
  returning id into v_tenant_id;

  raise notice 'Tenant ID: %', v_tenant_id;

  -- ── 4. Membership owner ────────────────────────────────────
  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant_id, v_user_id, 'owner', 'active')
  on conflict (tenant_id, user_id) do update
    set role   = 'owner',
        status = 'active';

  raise notice 'Membership owner provisionado';

  -- ── 5. Template 360° de exemplo ───────────────────────────
  -- Cria apenas se não existe nenhum template para este tenant.
  select id into v_tmpl_id
  from public.templates
  where tenant_id = v_tenant_id
  limit 1;

  if v_tmpl_id is null then
    insert into public.templates (
      tenant_id, name, method_code,
      scale_min, scale_max, allow_na,
      anonymous_by_group, n_minimum_default,
      show_self_separately, show_manager_separately,
      status
    )
    values (
      v_tenant_id, 'Avaliação 360° Padrão', '360',
      1, 5, true,
      true, 3,
      true, true,
      'active'
    )
    returning id into v_tmpl_id;
    raise notice 'Template criado: %', v_tmpl_id;
  else
    raise notice 'Template já existe: %', v_tmpl_id;
  end if;

  -- ── 6. Ciclos de exemplo (só se não existir nenhum) ───────
  if not exists (
    select 1 from public.cycles where tenant_id = v_tenant_id
  ) then

    insert into public.cycles (
      tenant_id, template_id, name, status,
      start_at, deadline_at, created_by
    ) values
      (v_tenant_id, v_tmpl_id, 'Ciclo 360° — Q2 2026', 'active',
       now(), now() + interval '30 days', v_user_id),
      (v_tenant_id, v_tmpl_id, 'Ciclo Piloto — Diretoria', 'draft',
       null, null, v_user_id),
      (v_tenant_id, v_tmpl_id, 'Avaliação Liderança 2025', 'closed',
       now() - interval '60 days', now() - interval '10 days', v_user_id);

    raise notice '3 ciclos de exemplo criados';
  else
    raise notice 'Ciclos já existem, pulando';
  end if;

  raise notice '──────────────────────────────────────────';
  raise notice 'Setup concluído!';
  raise notice '  tenant_id   : %', v_tenant_id;
  raise notice '  user_id     : %', v_user_id;
  raise notice '  template_id : %', v_tmpl_id;
  raise notice '──────────────────────────────────────────';

end $$;
