# roboflow-identify

Projeto de identificação de cores usando **Roboflow Workflows**.

- Workspace: `rodrigos-workspace-1ibon`
- Workflow: `my-first-project-mz66k` (my-first-project-mz66k — Base Workflow)

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # preencha ROBOFLOW_API_KEY
```

## Uso

```bash
python main.py minha_imagem.jpg
```

## Segurança

O `.env` está no `.gitignore` e nunca deve ser versionado.
