-- =====================================================================
-- 0109_dpa_public_branding.sql
--
-- O formulário público do DPA (respondente sem login) não sabia de qual
-- tenant era: título e ícone da aba vinham do tenant de quem estivesse
-- logado naquele navegador (ou do padrão "Maptiva" para quem não tem
-- login). Esta RPC devolve só o visual PÚBLICO do tenant dono do projeto,
-- localizado pelo token do próprio link (individual ou compartilhado).
-- =====================================================================

create or replace function public.get_dpa_branding(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'name',          coalesce(nullif(t.display_name, ''), t.name),
    'favicon_url',   t.favicon_url,
    'logo_url',      t.logo_url,
    'primary_color', t.primary_color
  )
  from public.tenants t
  where t.id = (
    select pp.tenant_id from public.dpa_participantes part
      join public.dpa_projetos pp on pp.id = part.projeto_id
     where part.token = p_token
    union all
    select pj.tenant_id from public.dpa_projetos pj
     where pj.shared_link_token = p_token
    limit 1
  )
$$;

grant execute on function public.get_dpa_branding(uuid) to anon, authenticated;
