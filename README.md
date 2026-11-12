# roboflow-identify

Projetos de visão computacional com Roboflow, publicados no GitHub Pages:

| Projeto | Pasta | Link |
|---|---|---|
| Identificador de Cores | `web/` | https://rodrigosilvacio.github.io/roboflow-identify/web/ |
| Contador de Carros | `contador-carros/` | https://rodrigosilvacio.github.io/roboflow-identify/contador-carros/ |
| Detector de Movimento | `detector-movimento/` | https://rodrigosilvacio.github.io/roboflow-identify/detector-movimento/ |
| Detector de Queda | `detector-queda/` | https://rodrigosilvacio.github.io/roboflow-identify/detector-queda/ |
| Avaliação do Cliente | `avaliacao-cliente/` | https://rodrigosilvacio.github.io/roboflow-identify/avaliacao-cliente/ |
| Vitrine por Gestos | `vitrine-maos/` | https://rodrigosilvacio.github.io/roboflow-identify/vitrine-maos/ |
| Armazém 3D por Gestos | `armazem-3d/` | https://rodrigosilvacio.github.io/roboflow-identify/armazem-3d/ |

## Consentimento (todos os projetos)

Antes de usar câmera ou imagens, cada projeto mostra um aviso de **MVP de visão computacional** explicando o que é coletado, onde é processado e se algo é armazenado. A pessoa escolhe **"Concordo"** ou **"Não concordo"**.

- **Sem consentimento,** a página fica bloqueada, incluindo colar e arrastar imagens, e nada é coletado.
- **Com consentimento,** a decisão vale até fechar a aba. O botão **🔒 Privacidade** permite revogar a qualquer momento.
- **No totem de Avaliação do Cliente,** o pedido aparece **a cada cliente**, ao tocar em "Avaliar com a câmera". Avaliar por toque não usa câmera.

Componente compartilhado: `shared/consent.js` e `shared/consent.css`.

---

## Identificador de Cores

Identificador de cores: envie uma imagem e receba a cor dominante (nome, HEX, RGB) e a paleta.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/

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

Deploy via GitHub Actions (`.github/workflows/pages.yml`) a cada push na `main`.
O workflow publica apenas os arquivos do site (`index.html`, `web/`, `contador-carros/`), sem código de backend.

Configuração única no repositório:
- *Settings > Pages > Source:* **GitHub Actions**
- *Settings > Environments > github-pages > Deployment branches:* permitir `main`

Teste local:

```bash
python -m http.server 8000 -d web
```

## 2. Roboflow via Supabase

Publicado no projeto **ClaudeProjects** (`xtrvojnauvkkterogrst`, sa-east-1):
`https://xtrvojnauvkkterogrst.supabase.co/functions/v1/identify-color`

Para refazer o deploy:

```bash
supabase link --project-ref <project-ref>
supabase secrets set ROBOFLOW_API_KEY=<sua-chave>   # ALLOWED_ORIGIN opcional
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
