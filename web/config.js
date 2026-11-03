// Configuração pública do front (sem segredos).
// Deixe ROBOFLOW_PROXY_URL vazio para usar apenas a análise local no navegador.
// Depois do deploy da Edge Function, preencha com:
//   https://<project-ref>.supabase.co/functions/v1/identify-color
window.APP_CONFIG = {
  ROBOFLOW_PROXY_URL: "",
  SUPABASE_ANON_KEY: "", // chave anon/publishable do Supabase (segura para o browser)
};
