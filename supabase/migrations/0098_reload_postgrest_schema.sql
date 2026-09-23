-- Força o PostgREST a recarregar o cache de funções — a 0097 criou
-- app.get_participant_question_divergence / get_my_question_divergence
-- com sucesso, mas a API ainda não enxergava as funções novas.
notify pgrst, 'reload schema';
