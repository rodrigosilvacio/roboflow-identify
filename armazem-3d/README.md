# Armazém 3D por Gestos (POC)

Um armazém em 3D navegado **sem tocar no computador**: a câmera do notebook reconhece as mãos e transforma gestos em comandos. Os gestos seguem a referência enviada em vídeo:

| Gesto | Ação |
|---|---|
| ☝️ **Indicador** | Move o cursor (anel azul) |
| 🤏 **Pinça** | **Clicar** (pinça curta, sem mexer: seleciona o módulo da estante) e **arrastar** (pinça com movimento: gira a vista) |
| ✋ **Palma em movimento** | **Move a vista** (a cena acompanha a mão). **Aproximar a palma da câmera dá zoom**; afastar sai do zoom |
| 🙌 **Pinça com as duas mãos** | Zoom, como no celular |
| ✊ **Mão fechada** | Pausa: descansa a mão sem mexer em nada |

Com o mouse: arrastar gira, botão direito move, roda dá zoom e clique seleciona.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/armazem-3d/

## O que tem na cena (tudo fictício)

- 13 estantes duplas porta-paletes, 14 módulos cada, 6 níveis, com cerca de 86% de ocupação (sempre a mesma)
- 12 ruas numeradas no chão (placas amarelas 01 a 12), áreas de **Expedição** (docas 1 a 6) e **Recebimento**
- Ao selecionar um módulo: estante, módulo, níveis e ocupação, além da lista de módulos selecionados

## Como funciona

- **Mãos:** MediaPipe Hand Landmarker (`vendor/mediapipe/`), até 2 mãos, no navegador.
- **3D:** three.js 0.160 (`vendor/three/`, licença MIT), com estantes desenhadas em lote (InstancedMesh). A cena **só é redesenhada quando algo muda**, para deixar o processador livre para o reconhecimento das mãos.
- **Lógica de gestos:** `shared/hand-logic.js`, compartilhada com a Vitrine por Gestos.
  - O gesto é reconhecido pelos dedos esticados e estabilizado por 120 ms.
  - A **palma** usa o centro da mão para mover a vista e o **tamanho da mão** (punho até a base do dedo médio) para o zoom: mão perto da câmera parece maior. Pequenos tremores são ignorados.
  - A **pinça** com até 14 px de movimento e até 0,6 s é clique; acima disso, é arrasto.
  - Com duas mãos visíveis, a pinça de uma só não clica, para não selecionar nada ao começar o zoom.
- **Processador:** no modo Automático, começa pela GPU e troca para a CPU se ela estiver lenta (algumas placas travam ao devolver o resultado). O diagnóstico mostra o processador, os quadros por segundo e a % de quadros com mão.

## Testes

```bash
node armazem-3d/tests/gesture-nav.test.js
```

São 9 cenários: palma parada não mexe, palma para a direita move, palma se aproximando e se afastando dá zoom, sem salto ao perder a mão, pinça curta é clique, pinça com movimento é arrasto, pinça longa parada não é clique e palma aberta reconhecida.

No Chromium, com os CDNs externos bloqueados (15 verificações):
- **Mãos simuladas:** indicador com cursor, pinça curta selecionou "Estante 05 · Módulo 09", pinça arrastando girou a vista sem selecionar, palma moveu a vista, palma se aproximando deu zoom (distância 91 → 28) e se afastando saiu (28 → 51), mão fechada não mexeu nada, duas mãos deram zoom (68 → 8) sem selecionar e o cursor some sem mão.
- **Modelo real** (foto de mão apontando como câmera falsa): GPU emulada lenta trocada para CPU (9 quadros/s), mão em 100% dos quadros, gesto "☝️ Indicador".

## Próximos passos possíveis

1. Celular como câmera (conectar o celular à página do notebook).
2. Dados reais de ocupação (WMS) e busca de endereço ("ir para a rua 09, módulo 4").
3. Planta real do armazém em vez do layout gerado.

## Privacidade

Aviso de consentimento antes de ligar a câmera. Só os pontos das mãos são usados, no navegador. Nenhuma imagem é enviada ou gravada.
