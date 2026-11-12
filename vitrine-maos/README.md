# Vitrine por Gestos (POC)

Prateleiras com produtos fictícios. Você **aponta com o dedo indicador** e o produto entra na **legenda** (Banana, Pera…), com ou sem zoom. A mão é mapeada pelo **Google MediaPipe Hand Landmarker**, direto no navegador.

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

- **Apontar:** a ponta do indicador move o cursor (espelhado: mão à direita, cursor à direita).
- **Parar 1,2 s** sobre o produto: o anel enche e o produto entra na lista.
- **Pinça** (polegar no indicador): seleciona na hora. Usa o produto de cerca de 150 ms antes, porque o dedo se desloca ao fechar a pinça.
- O mesmo produto só é contado de novo depois que o cursor **sai e volta**.

Zoom: botões **+ / − / Ver tudo**, roda do mouse ou teclas **+ / − / 0**. Deslocamento: arrastar com o mouse, setas do teclado ou cursor da mão na borda.

**Sem câmera:** o mouse faz o mesmo papel (parar sobre o produto ou clicar), para demonstrar e testar.

## Testes

```bash
node vitrine-maos/tests/hand-logic.test.js
```

São 16 cenários: filtro parado e em movimento rápido, área ativa e espelhamento, pinça com histerese e independente da distância, permanência, passar rápido sem selecionar, tremor curto, não repetir, sair e voltar, pinça sem duplicar, histórico da pinça e tempo de atenção.

Também foi testado no Chromium, com os CDNs externos bloqueados:
- **Mouse:** permanência, varredura rápida sem seleção, clique, zoom de 195% e "Ver tudo".
- **Mão simulada:** permanência, pinça, sem duplicar, deslocamento pela borda com zoom e cursor some sem mão.
- **Modelo real:** uma foto de mão apontando, movida como câmera falsa. O cursor percorreu Pera, Queijo e Arroz e selecionou a Pera quando a mão parou.

## Próximos passos possíveis

1. **Zoom por gesto:** afastar ou aproximar as duas mãos.
2. **Mapa de calor da atenção** sobre a prateleira e exportação em CSV.
3. **Tela grande ou vitrine física:** com câmera fixa, ver produtos reais detectados pelo Roboflow em vez de cartões fictícios.

## Privacidade

- Aviso de consentimento antes de ligar a câmera.
- Só os 21 pontos da mão são usados, e todo o processamento é no navegador. Nenhuma imagem é enviada ou gravada.
- A lista fica só na aba.
