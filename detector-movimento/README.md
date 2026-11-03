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
              a) É pessoa?            RF-DETR Nano, classe person
              b) Tem celular visível? recorte ampliado em volta de cada pessoa
                                      + busca na imagem inteira (RF-DETR Small)
              ▼
           Alerta de pessoa ou de pessoa com celular + registro com miniatura
```

1. **Detecção de movimento local:** a página compara quadros reduzidos (64x48) e mede quanto da imagem mudou. Não usa IA nem internet.
2. **Confirmação com IA:** só quando há movimento, um quadro (960 px) vai para a Edge Function `detect-person`, que chama o Workflow `detector-pessoa-celular` no Roboflow:
   - detecta pessoas;
   - amplia a caixa de cada pessoa e recorta a região, para o celular parecer maior ao modelo;
   - procura `cell phone` nos recortes e também na imagem inteira (caso só a mão apareça);
   - a função junta as duas buscas sem duplicar.

O anti-repetição é separado por tipo: se a pessoa aparece primeiro sem celular e depois pega o celular, o segundo alerta dispara mesmo dentro dos 10 s.

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
