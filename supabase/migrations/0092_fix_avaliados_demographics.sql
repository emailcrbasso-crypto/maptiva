-- =====================================================================
-- 0092_fix_avaliados_demographics.sql
--
-- Auditoria externa (Flexmetal v2): o corte demográfico do ciclo
-- (páginas 17/18 do relatório) estava perdendo os 13 avaliadores que
-- também são gestores avaliados (ex.: Sergio avaliando Marcos como
-- Liderança Superior) — porque o import só preencheu
-- people.metadata_json (funcao/nivel/ordem_nivel) para os 16
-- "avaliados", sem sexo/geracao/cargo/tempo_casa, que a aba
-- AVALIADORES já tinha pros MESMOS códigos. O corte demográfico
-- (0072) precisa desses campos pra incluir a resposta de um avaliador
-- no agrupamento — sem eles, a resposta é descartada silenciosamente.
--
-- Corrige mesclando os campos que faltavam, sem sobrescrever
-- funcao/nivel/ordem_nivel já existentes.
-- =====================================================================

begin;

update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração X", "cargo": "GESTÃO", "tempo_casa": "Maior que 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-165@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "GESTÃO", "tempo_casa": "Maior que 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-97@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração X", "cargo": "GESTÃO", "tempo_casa": "De 3 à 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-140@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "F", "geracao": "Geração X", "cargo": "GESTÃO", "tempo_casa": "Menor que 1 ano"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-54@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "GESTÃO", "tempo_casa": "De 3 à 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-128@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "GESTÃO", "tempo_casa": "Menor que 1 ano"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-111@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "F", "geracao": "Geração X", "cargo": "GESTÃO", "tempo_casa": "Menor que 1 ano"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-66@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "GESTÃO", "tempo_casa": "Maior que 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-161@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração X", "cargo": "GESTÃO", "tempo_casa": "De 1 à 3 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-122@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "GESTÃO", "tempo_casa": "De 3 à 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-102@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "F", "geracao": "Geração X", "cargo": "ADMINISTRATIVO", "tempo_casa": "De 1 à 3 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-176@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "ADMINISTRATIVO", "tempo_casa": "Maior que 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-145@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "ADMINISTRATIVO", "tempo_casa": "Maior que 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-96@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "F", "geracao": "Geração Y (Millennial)", "cargo": "ADMINISTRATIVO", "tempo_casa": "Maior que 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-95@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "F", "geracao": "Geração Y (Millennial)", "cargo": "ADMINISTRATIVO", "tempo_casa": "De 1 à 3 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-35@import.crbasso.internal';
update public.people set metadata_json = metadata_json || '{"sexo": "M", "geracao": "Geração Y (Millennial)", "cargo": "ADMINISTRATIVO", "tempo_casa": "Maior que 5 anos"}'::jsonb where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df' and email = 'flexmetal-v2-avaliado-4@import.crbasso.internal';

commit;
