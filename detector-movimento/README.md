# Detector de Movimento (MVP)

Deixe a página aberta com a câmera do PC ligada. Quando uma **pessoa** passar, a página dá um alerta visual, sonoro e, opcionalmente, uma notificação do sistema. Cortina, sombra ou um objeto se mexendo não disparam alerta.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/detector-movimento/

## Como funciona (duas etapas)

```
Webcam ──► 1. Movimento? (navegador, 5x/s, custo zero)
              │ sim
              ▼
           2. É pessoa? (Roboflow RF-DETR, no máximo 1 consulta a cada 2,5 s)
              │ sim
              ▼
           Alerta + registro com miniatura
```

1. **Detecção de movimento local:** a página compara quadros reduzidos (64x48) e mede quanto da imagem mudou. Não usa IA nem internet.
2. **Confirmação com IA:** só quando há movimento, um quadro (640 px) vai para a Edge Function `detect-person`, que chama o Workflow `detector-de-pessoas` no Roboflow (RF-DETR Nano, classe `person` do COCO).

Essa etapa 1 funciona como filtro de custo: a IA só é chamada quando algo acontece.

## Configuração

Usa o mesmo secret `ROBOFLOW_API_KEY` dos outros projetos, no Supabase **ClaudeProjects**.

## Limitações do MVP

- A aba precisa ficar aberta e visível. Navegadores desaceleram abas em segundo plano.
- Os alertas ficam só na tela. Para avisar por WhatsApp ou e-mail, o próximo passo é gravar o evento no Supabase e disparar a notificação de lá.
- Mudança brusca de luz (acender a luz) conta como movimento, mas a IA filtra se não houver pessoa.

## LGPD

- O vídeo não sai do navegador. Só quadros com movimento vão ao Roboflow, sem armazenamento.
- As miniaturas ficam apenas na aba e somem ao fechá-la.
- Avise as pessoas do ambiente que há uma câmera ligada.
