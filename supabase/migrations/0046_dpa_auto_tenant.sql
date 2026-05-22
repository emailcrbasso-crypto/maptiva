-- 0046_dpa_auto_tenant.sql
--
-- Trigger que preenche tenant_id automaticamente nas tabelas DPA
-- quando o INSERT não o fornece explicitamente.
-- Isso permite que o frontend insira sem precisar passar tenant_id,
-- mantendo a compatibilidade com as RLS policies existentes.

create or replace function public.dpa_set_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is null then
    new.tenant_id := app.current_tenant_id();
  end if;
  return new;
end;
$$;

create trigger dpa_projetos_auto_tenant
  before insert on public.dpa_projetos
  for each row execute function public.dpa_set_tenant_id();

create trigger dpa_participantes_auto_tenant
  before insert on public.dpa_participantes
  for each row execute function public.dpa_set_tenant_id();

create trigger dpa_respostas_auto_tenant
  before insert on public.dpa_respostas
  for each row execute function public.dpa_set_tenant_id();
