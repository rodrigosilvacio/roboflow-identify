# Vitrine por Gestos (POC)

Prateleiras com produtos fictícios **controladas pelas mãos**: apontar escolhe o produto, a pinça com as duas mãos dá zoom e a mão fechada arrasta. O produto escolhido entra na **legenda** (Banana, Pera…), com quantidade e tempo de atenção. As mãos são mapeadas pelo **Google MediaPipe Hand Landmarker**, direto no navegador.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/vitrine-maos/

## A lógica (e o que melhorou)

| Ideia inicial | Problema | Como ficou |
|---|---|---|
| "Apontar" para o produto | A câmera não sabe para onde o dedo aponta em 3D | A **ponta do indicador vira um cursor**, como um mouse no ar |
| Mão mapeada direto | A mão treme e o cursor pula entre produtos | **Filtro One Euro:** firme parado (tremor cerca de 9x menor), ágil em movimento |
| Produto apontado entra na lista | **Toque de Midas:** tudo no caminho entraria | Selecionar **de propósito**: **parar 1,2 s** (com anel de progresso) ou **pinça** (polegar + indicador) |
| Câmera inteira = tela inteira | Braço cansa para alcançar as bordas | **Área ativa:** só o centro da câmera é mapeado para a prateleira |
| Cursor exato | Fácil cair no vão entre produtos | **Ímã:** até 40 px de um produto conta como apontando para ele |
| Zoom | A posição dos produtos muda | O produto é identificado pelo que está **de fato sob o cursor**, com ou sem zoom. Com zoom, encostar o cursor na borda **desloca a prateleira** |
| Legenda com nomes | Só mostra o que foi escolhido | Legenda com **quantidade** e **tempo de atenção** por produto (mapa de interesse) |

## Gestos

| Gesto | Ação |
|---|---|
| ☝️ **Apontar** (indicador esticado) | Move o cursor. Parar 1,2 s sobre o produto seleciona |
| 🤏 **Pinça** (polegar no indicador) | Seleciona na hora. Usa o produto de ~150 ms antes, porque o dedo se desloca ao fechar |
| 🙌 **Pinça com as duas mãos** | Afastar = aproximar a prateleira; juntar = afastar. Mover as duas juntas desloca a vista |
| ✊ **Mão fechada** e mover | Agarra e arrasta a prateleira (com zoom) |
| 🔍 **Botões 🔍+ / 🔍− / ⤢ dentro da prateleira** | Zoom com uma mão só: apontar 0,6 s aciona (e repete segurando) ou pinça aciona na hora |

- O gesto é reconhecido pelos **dedos esticados** (a ponta mais longe do punho que a articulação do meio) e precisa ficar **estável por 120 ms** para não "piscar". A pinça vale na hora.
- **Com duas mãos visíveis, a pinça de uma só não seleciona**, para não escolher um produto sem querer ao começar o zoom.
- O mesmo produto só é contado de novo depois que o cursor **sai e volta**.

Também funcionam botões + / − / Ver tudo, a roda do mouse, as teclas + / − / 0, arrastar com o mouse e as setas.

**Sem câmera:** o mouse faz o mesmo papel (parar sobre o produto ou clicar), para demonstrar e testar.

## Desempenho e diagnóstico

O painel mostra **modelo, processador (GPU ou CPU), quadros por segundo e % de quadros com mão detectada**.

- **Automático (padrão):** começa pela GPU e, depois de 3 s e pelo menos 3 quadros, mede a velocidade desde o primeiro quadro (funciona mesmo com menos de 1 quadro/s). Abaixo de 10 quadros/s, **troca sozinho para a CPU**. Em algumas placas de vídeo, a GPU trava ao devolver o resultado ("GPU stall due to ReadPixels"). No teste com GPU emulada, ela rodou a 2 quadros/s, contra 11 a 12 na CPU.
- **Seletor de processador** e o parâmetro `?processador=cpu` ou `?processador=gpu` na URL forçam um dos dois.
- Erros repetidos na GPU também fazem a troca para a CPU.

## Testes

```bash
node vitrine-maos/tests/hand-logic.test.js
```

São 24 cenários: filtro parado e em movimento rápido, área ativa e espelhamento, pinça com histerese e independente da distância, permanência, passar rápido sem selecionar, tremor curto, não repetir, sair e voltar, pinça sem duplicar, histórico da pinça, tempo de atenção, reconhecimento de gestos (apontar, punho, mão aberta, pinça), estabilizador de gesto, zoom com duas mãos e arrasto com a mão fechada.

Também foi testado no Chromium, com os CDNs externos bloqueados (20 verificações):
- **Modelo real, modo Automático com GPU emulada:** a GPU lenta foi trocada para a CPU (12 quadros/s, mão em 100% dos quadros). A foto de mão apontando foi reconhecida como "☝️ Apontando", e a mão parada selecionou a Pera.
- **Duas mãos simuladas, com dedos anatômicos:** apontar e parar, pinça imediata, pinça de uma mão sem selecionar quando há duas, zoom afastando (0,75 → 3,01) e aproximando (3,01 → 1,81), mão fechada arrastando, botões 🔍+ (apontar e segurar repete) e ⤢ (pinça) e cursor some sem mão.
- **Mouse:** permanência, clique no 🔍+ e página sem rolagem lateral no celular.

## Próximos passos possíveis

1. **Mapa de calor da atenção** sobre a prateleira e exportação em CSV.
2. **Tela grande ou vitrine física:** com câmera fixa, ver produtos reais detectados pelo Roboflow em vez de cartões fictícios.

## Privacidade

- Aviso de consentimento antes de ligar a câmera.
- Só os 21 pontos da mão são usados, e todo o processamento é no navegador. Nenhuma imagem é enviada ou gravada.
- A lista fica só na aba.
