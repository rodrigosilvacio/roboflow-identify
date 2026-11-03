# Contador de Carros

Envie uma imagem e o sistema conta quantos carros existem nela, desenhando uma caixa numerada em cada um.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/contador-carros/

## Arquitetura

```
GitHub Pages (contador-carros/)  ──►  Supabase Edge Function count-cars  ──►  Roboflow Workflow contador-de-carros
                                       (guarda a API key, valida entrada)       RF-DETR Nano (COCO) + contagem
```

- **Modelo:** RF-DETR Nano pré-treinado no COCO, que já reconhece `car`, `truck`, `bus` e `motorcycle`. Não precisa de treino.
- **Workflow Roboflow:** `contador-de-carros` (workspace `rodrigos-workspace-1ibon`), spec em `roboflow/`.
- **Parâmetros:** confiança mínima (10% a 90%) e classes de veículo. A função só aceita classes de veículo.

## Configuração

Usa o mesmo secret `ROBOFLOW_API_KEY` do identificador de cores, no projeto Supabase **ClaudeProjects**.

Para refazer o deploy da função:

```bash
supabase functions deploy count-cars
```

## Limitações conhecidas

- Carros muito pequenos, cortados ou muito sobrepostos podem não ser contados. Reduza a confiança mínima ou use uma imagem maior.
- Para câmeras fixas (estacionamento, cancela), o próximo passo é treinar um RF-DETR com fotos do próprio local.
