# Detector de Movimento (MVP)

Deixe a página aberta com a câmera do PC ligada. A página tem dois níveis de alerta:

| Situação | Alerta |
|---|---|
| 🚶 Pessoa passou | Faixa vermelha, 3 bipes graves |
| 📱 Pessoa com celular visível | Faixa laranja, 5 bipes agudos |

Cortina, sombra ou um objeto se mexendo não disparam alerta.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/detector-movimento/

## Como funciona (duas etapas)

```
Webcam ──► 1. Movimento? (navegador, 5x/s, custo zero)
              │ sim
              ▼
           2. Roboflow (no máximo 1 consulta a cada 2,5 s)
              RF-DETR Medium procura person e cell phone numa única passada
              ▼
           Alerta de pessoa ou de pessoa com celular + registro com miniatura
```

1. **Detecção de movimento local:** a página compara quadros reduzidos (64x48) e mede quanto da imagem mudou. Não usa IA nem internet.
2. **Confirmação com IA:** quando há movimento, um quadro (960 px) vai para a Edge Function `detect-person`, que chama o Workflow `detector-pessoa-celular` no Roboflow: **um único modelo RF-DETR Medium** procurando `person` e `cell phone` ao mesmo tempo.
3. **Modo presença:** depois de ver uma pessoa, a página continua consultando a IA a cada 2,5 s por 20 s, mesmo sem movimento. Assim, quem fica parado mostrando o celular para a câmera ainda é analisado.
4. **Aquecimento:** ao ligar a câmera, uma primeira chamada carrega o modelo no Roboflow (a primeira costuma levar alguns segundos) sem gerar alerta.

O anti-repetição é separado por tipo: se a pessoa aparece primeiro sem celular e depois pega o celular, o segundo alerta dispara mesmo dentro dos 10 s.

## Calibração

- **Linha de diagnóstico** abaixo do vídeo: tempo da análise, pessoas vistas e a **maior confiança de celular**, mesmo abaixo do limite. Se o celular aparece com 18% e o limite é 25%, baixe o limite; se aparece "nada parecido", melhore ângulo, distância ou luz.
- **Limite de confiança do celular:** de 15% a 60% (padrão 25%). Mais baixo detecta mais, mas aumenta falso alerta.
- **Analisar agora:** força uma análise sem depender de movimento.

### Histórico de decisões

- *v1:* pessoa, depois recorte ampliado e busca de celular (RF-DETR Small) no recorte e na imagem inteira. Eram 3 modelos em sequência, com 6,6 s de latência na primeira chamada.
- *v2 (atual):* 1 modelo RF-DETR Medium para as duas classes. Na webcam a pessoa ocupa quase o quadro todo, então o recorte acrescentava tempo sem ganho real.

Essa etapa 1 funciona como filtro de custo: a IA só é chamada quando algo acontece.

## Configuração

Usa o mesmo secret `ROBOFLOW_API_KEY` dos outros projetos, no Supabase **ClaudeProjects**.

## Limitações do MVP

- A aba precisa ficar aberta e visível. Navegadores desaceleram abas em segundo plano.
- Os alertas ficam só na tela. Para avisar por WhatsApp ou e-mail, o próximo passo é gravar o evento no Supabase e disparar a notificação de lá.
- Mudança brusca de luz (acender a luz) conta como movimento, mas a IA filtra se não houver pessoa.
- **Celular só é detectado se estiver visível.** No bolso ou na bolsa, nenhum modelo vê.
- Objetos parecidos (controle remoto, carteira) podem gerar falso alerta de celular. Se acontecer muito, o próximo passo é treinar um modelo com fotos do próprio local.
- Funciona melhor com a câmera perto da porta, na altura das mãos, e com boa luz.

## LGPD

- O vídeo não sai do navegador. Só quadros com movimento vão ao Roboflow, sem armazenamento.
- O alerta de celular é um aviso para uma pessoa avaliar, não uma decisão automática.
- As miniaturas ficam apenas na aba e somem ao fechá-la.
- Avise as pessoas do ambiente que há uma câmera ligada.
