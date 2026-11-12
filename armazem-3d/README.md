# Armazém 3D por Gestos (POC)

Um armazém em 3D navegado **sem tocar no computador**: a câmera do notebook reconhece as mãos e transforma gestos em comandos. Os gestos seguem a referência enviada em vídeo:

| Gesto | Ação |
|---|---|
| ☝️ **Indicador** | Move o cursor (anel azul) |
| 🤏 **Pinça** | **Pinça rápida = clique**: apresenta o local. **Pinça e mover**: gira a vista |
| ✋ **Palma aberta** (segure 0,4 s) e mova | **Move a vista** (a cena acompanha a mão). **Aproximar a palma da câmera dá zoom**; afastar sai do zoom |
| 🙌 **Pinça com as duas mãos** | Zoom, como no celular |
| ✊ **Mão fechada** | Pausa: descansa a mão sem mexer em nada |

Com o mouse: arrastar gira, botão direito move, roda dá zoom e clique apresenta o local.

## Clicar em um local

Clicar (pinça rápida ou mouse) em **qualquer lugar** apresenta o local: a vista **voa até ele**, aparece um **alfinete 📍** com o endereço e um **cartão** com os detalhes.

| Onde clicou | O que aparece |
|---|---|
| **Topo da estante** (visto de cima) | Rua · Estante · Módulo, ocupação do módulo e por nível (ex.: `R04-E05-M09`) |
| **Frente da estante** (de perto) | O **nível exato** e a ocupação dele (ex.: `R07-E07-M09-N4`, "Nível 4: 4 de 4 paletes") |
| **Chão entre estantes** | Rua (corredor), em frente a qual módulo e entre quais estantes |
| **Corredor principal, Expedição, Recebimento** | A área e a doca mais próxima |

## Deixar claro o que está acontecendo

- **Faixa de modo** no topo da cena: "☝️ Apontando: Estante 05 · Módulo 09", "🤏 Pinça: solte rápido para clicar", "✋ Movendo a vista", "✊ Pausado"…
- **Etiqueta junto ao cursor** com o local apontado, e destaque azul da estante sob ele.
- **Clique visível:** anel vermelho que se expande, som curto e cartão do local. A etiqueta some por 2 s depois do clique, para não confundir.
- **Palma:** um anel amarelo enche enquanto você segura a palma aberta; só depois a vista se move.

## Sensibilidade (começa em Baixa)

| | Baixa (padrão) | Média | Alta |
|---|---|---|---|
| Tempo segurando a palma antes de mover | 0,4 s | 0,28 s | 0,16 s |
| Força do movimento da palma | 0,7 | 1,0 | 1,5 |
| Movimento mínimo considerado (zona morta) | maior | média | menor |
| Limite de deslocamento e zoom por quadro | 2% e 4% | 3% e 6% | 5% e 10% |
| Suavização do cursor | mais firme | média | mais ágil |

## Simulação

O botão **▶ Simular gestos** roda uma demonstração de cerca de 25 s **sem câmera**: uma mão sintética (21 pontos, como a do MediaPipe) passa pelo mesmo caminho da câmera real e mostra, passo a passo, indicador, local junto ao cursor, pinça para clicar (apresenta a Estante 05 · Módulo 09), palma para andar e dar zoom, pinça para girar e mão fechada. O roteiro está em `sim.js`.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/armazem-3d/

## O que tem na cena (tudo fictício)

- 13 estantes duplas porta-paletes, 14 módulos cada, 6 níveis, com cerca de 86% de ocupação (sempre a mesma)
- 12 ruas numeradas no chão (placas amarelas 01 a 12), áreas de **Expedição** (docas 1 a 6) e **Recebimento**
- Ao clicar: endereço do local, ocupação, alfinete e a lista de locais clicados

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

No Chromium, com os CDNs externos bloqueados:
- **Mãos simuladas (15 verificações):** indicador, pinça curta clicando, pinça arrastando girando, palma movendo e dando zoom, mão fechada sem mexer, duas mãos com zoom e cursor some sem mão.
- **Clique e simulação (gravados em vídeo):**
  - clique no chão apresentou "Rua 05 (corredor) · R05-M10" e "Expedição · doca 3";
  - clique na frente da estante apresentou "Estante 07 · Módulo 09 · Nível 4: 4 de 4 paletes";
  - a simulação passou pelas 6 etapas e a pinça apresentou "Rua 04 · Estante 05 · Módulo 09", sem erros.
- **Modelo real** (foto de mão apontando como câmera falsa): GPU lenta trocada para CPU, mão em 100% dos quadros, gesto "☝️ Indicador".

## Próximos passos possíveis

1. Celular como câmera (conectar o celular à página do notebook).
2. Dados reais de ocupação (WMS) e busca de endereço ("ir para a rua 09, módulo 4").
3. Planta real do armazém em vez do layout gerado.

## Privacidade

Aviso de consentimento antes de ligar a câmera. Só os pontos das mãos são usados, no navegador. Nenhuma imagem é enviada ou gravada.
