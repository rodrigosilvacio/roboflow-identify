# roboflow-identify

Identificador de cores: envie uma imagem e receba a cor dominante (nome, HEX, RGB) e a paleta.

## Arquitetura

```
GitHub Pages (web/)  ──►  análise local no navegador (k-means + nome em CIELAB)
        │
        └─(opcional)─►  Supabase Edge Function  ──►  Roboflow Workflow
                         (guarda a API key)          identificador-de-cores-mvp
                                                      (bloco Dominant Color)
```

- **Modo local (padrão):** funciona sem backend, a imagem não sai do navegador (bom para LGPD).
- **Modo Roboflow:** ativado quando `web/config.js` recebe a URL da Edge Function. A chave do Roboflow fica só no Supabase.

Workspace: `rodrigos-workspace-1ibon` · Workflow: `identificador-de-cores-mvp`.
O `my-first-project-mz66k — Base Workflow` é gerenciado pela plataforma e não aceita edição via API.

## 1. Publicar no GitHub Pages

1. Em *Settings > Pages*, escolha **Source: GitHub Actions**.
2. Faça merge para `main`. O workflow `.github/workflows/pages.yml` publica a pasta `web/`.
3. URL: `https://rodrigosilvacio.github.io/roboflow-identify/`

Teste local:

```bash
python -m http.server 8000 -d web
```

## 2. (Opcional) Ligar o Roboflow via Supabase

```bash
supabase link --project-ref <project-ref>
supabase secrets set ROBOFLOW_API_KEY=<sua-chave> ALLOWED_ORIGIN=https://rodrigosilvacio.github.io
supabase functions deploy identify-color
```

Depois preencha `web/config.js`:

```js
ROBOFLOW_PROXY_URL: "https://<project-ref>.supabase.co/functions/v1/identify-color",
SUPABASE_ANON_KEY: "<anon/publishable key>",
```

## 3. Script Python (CLI)

```bash
pip install -r requirements.txt
cp .env.example .env   # preencha ROBOFLOW_API_KEY
python main.py minha_imagem.jpg
```

## Segurança

- `.env` está no `.gitignore` e nunca deve ser versionado.
- A API key do Roboflow nunca vai para o front; o GitHub Pages é público.
- A Edge Function limita tamanho (8 MB), restringe CORS por `ALLOWED_ORIGIN` e loga só status e latência, sem a imagem.
