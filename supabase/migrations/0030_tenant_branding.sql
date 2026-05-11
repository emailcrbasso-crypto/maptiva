-- =====================================================================
-- 0030_tenant_branding.sql
-- Adiciona colunas de branding/white-label à tabela tenants.
--
-- Campos:
--   display_name        — Nome público da empresa (pode diferir do slug)
--   logo_url            — URL do logo (hospedado em Supabase Storage ou CDN)
--   favicon_url         — Favicon personalizado
--   primary_color       — Cor primária (hex, e.g. "#1d4ed8")
--   secondary_color     — Cor secundária
--   email_from_name     — Nome exibido no remetente de e-mails
--   email_from_address  — E-mail remetente (se vazio, usa o padrão Maptiva)
--   email_header_html   — HTML extra no cabeçalho de e-mails (logo, banner)
--   email_footer_html   — HTML extra no rodapé de e-mails
--   hide_maptiva_brand  — Ocultar marca Maptiva em e-mails e PDF (plano white label)
--   custom_domain       — Domínio próprio do cliente (ex: "avaliacoes.empresa.com.br")
--   tagline             — Texto descritivo exibido na tela de login
--   pdf_footer_text     — Texto no rodapé dos PDFs (padrão: "Relatório Confidencial")
--   settings_json       — JSON livre para configurações futuras
-- =====================================================================

alter table public.tenants
  add column if not exists display_name       text,
  add column if not exists logo_url           text,
  add column if not exists favicon_url        text,
  add column if not exists primary_color      text default '#111827',
  add column if not exists secondary_color    text default '#6b7280',
  add column if not exists email_from_name    text,
  add column if not exists email_from_address text,
  add column if not exists email_header_html  text,
  add column if not exists email_footer_html  text,
  add column if not exists hide_maptiva_brand boolean not null default false,
  add column if not exists custom_domain      text unique,
  add column if not exists tagline            text,
  add column if not exists pdf_footer_text    text,
  add column if not exists settings_json      jsonb;

-- Índice para lookup por domínio customizado (roteamento multi-domain)
create unique index if not exists tenants_custom_domain_uniq
  on public.tenants (custom_domain) where custom_domain is not null;

-- RPC pública: retorna branding do tenant atual (sem dados sensíveis)
-- Usada pelo frontend logo após o login para carregar o contexto visual.
create or replace function public.get_tenant_branding()
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select jsonb_build_object(
    'id',                 t.id,
    'name',               coalesce(t.display_name, t.name),
    'slug',               t.slug,
    'logo_url',           t.logo_url,
    'favicon_url',        t.favicon_url,
    'primary_color',      coalesce(t.primary_color, '#111827'),
    'secondary_color',    coalesce(t.secondary_color, '#6b7280'),
    'hide_maptiva_brand', t.hide_maptiva_brand,
    'tagline',            t.tagline,
    'pdf_footer_text',    coalesce(t.pdf_footer_text, 'Relatório Confidencial'),
    'locale',             coalesce(t.locale, 'pt-BR'),
    'custom_domain',      t.custom_domain
  )
  from public.tenants t
  where t.id = app.current_tenant_id()
$$;

grant execute on function public.get_tenant_branding() to authenticated;

-- RPC pública: lookup de tenant por domínio (usado em multi-domain routing)
-- Acessível por anon para suportar tela de login sem autenticação prévia.
create or replace function public.get_tenant_by_domain(p_domain text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id',            t.id,
    'name',          coalesce(t.display_name, t.name),
    'slug',          t.slug,
    'logo_url',      t.logo_url,
    'primary_color', coalesce(t.primary_color, '#111827'),
    'tagline',       t.tagline
  )
  from public.tenants t
  where t.custom_domain = lower(p_domain)
    and t.status = 'active'
  limit 1
$$;

grant execute on function public.get_tenant_by_domain(text) to anon, authenticated;

-- Atualizar o admin pode editar branding do próprio tenant
-- (INSERT/UPDATE já concedidos em 0014; aqui garantimos coluna por coluna não é necessário)
-- O owner pode chamar UPDATE direto em tenants (RLS permite para owner do tenant).
