# Avaliação do Cliente (MVP)

Totem de avaliação de atendimento: o cliente avalia **com a expressão do rosto ou com um toque**. A câmera **sugere** e o cliente **confirma ou corrige**.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/avaliacao-cliente/
**Painel do gestor:** https://rodrigosilvacio.github.io/roboflow-identify/avaliacao-cliente/#painel

## Por que este desenho

| Ideia inicial | Risco | Como ficou |
|---|---|---|
| Câmera avaliando o cliente o tempo todo | Rosto é **dado biométrico** (dado pessoal sensível na LGPD): exige consentimento | O cliente **escolhe** avaliar com a câmera, e sempre há a opção de **tocar** |
| Sorriso = satisfeito | Expressão não é emoção: há sorriso educado e satisfação séria | A câmera só **sugere**, e o cliente **confirma ou corrige** |
| Gravar para analisar depois | Guardar imagem de rosto aumenta risco e responsabilidade | A câmera liga por **3 s**, analisa **no aparelho** e desliga. **Nenhuma imagem** é gravada ou enviada |
| Confiar na IA | Não se sabe o quanto ela acerta | O painel mede o **acerto da câmera** com base nas confirmações |

## Fluxo

1. **Tela inicial:** "Avaliar com a câmera" ou tocar em 😊 / 😐 / ☹️.
2. **Câmera (3 s):** o MediaPipe Face Landmarker lê 52 medidas do rosto por quadro, e a sessão decide por **maioria dos quadros**.
3. **Confirmação:** "Parece que você saiu Satisfeito 😊. Acertamos?" O cliente envia ou corrige. Sem resposta em 20 s, a avaliação é descartada.
4. **Obrigado:** volta ao início em 4 s.

## Regras (`expression-logic.js`)

- **Satisfeito:** sorriso médio (`mouthSmileLeft/Right`) de pelo menos 0,45.
- **Insatisfeito:** índice de tristeza de pelo menos 0,35, com pouco sorriso. O índice combina cantos da boca para baixo (`mouthFrown`), sobrancelha interna levantada (`browInnerUp`) e lábios apertados (`mouthPress`). A sobrancelha **só conta junto com sinais na boca**, porque sozinha ela indica surpresa.
- **Neutro:** todo o resto. **Sério não é insatisfeito.**
- **Sessão:** pelo menos 8 quadros com rosto. Empate no topo vira **neutro**, a leitura mais conservadora.

## Painel do gestor

- Total de avaliações, % de satisfeitos e índice (% satisfeitos − % insatisfeitos, de −100 a +100)
- **Acerto da câmera:** quantas sugestões o cliente confirmou
- Últimas avaliações, exportação em CSV e botão para apagar dados
- **MVP:** os dados ficam salvos no navegador do totem. Para vários totens num painel único, o próximo passo é gravar no Supabase.

## Testes

```bash
node avaliacao-cliente/tests/expression-logic.test.js
```

São 13 cenários: sorriso, sério, triste, sorriso discreto, surpresa (não pode virar triste), formato do MediaPipe, sem rosto, sessão por maioria, empate e indicadores do painel.

Também foi testado com o modelo real no Chromium, com uma foto de retrato sorrindo como câmera falsa: sugeriu **Satisfeito** (14 de 14 quadros, sorriso 0,93). Com uma foto sem rosto, pediu para tentar de novo. Em ambos os casos, nenhuma chamada externa.

## Limitações

- **Tristeza é a expressão mais difícil** de ler pelo rosto, e o modelo tende a classificar como neutro. O acerto da câmera no painel mostra isso na prática.
- **Um rosto por vez,** de frente e com luz razoável.
- Os limites de cada expressão são um ponto de partida. Com dados reais do painel, dá para calibrá-los.

## LGPD e boas práticas

- **Aviso visível** no totem: o que é coletado, por quanto tempo e para quê.
- **Alternativa sem câmera** sempre disponível, para o consentimento ser livre.
- **Nenhuma imagem** sai do aparelho ou é armazenada. Só a avaliação, o horário e a origem.
- **Não identifica** o cliente e não cruza a avaliação com cadastro.
- **Não usar com funcionários** para medir humor ou produtividade: é outro contexto, com riscos trabalhistas e éticos maiores.
