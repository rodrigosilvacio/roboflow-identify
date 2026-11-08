# Detector de Queda (MVP)

A câmera acompanha o **esqueleto** da pessoa em tempo real. Se ela **cair e não levantar**, soa uma sirene até alguém confirmar que está tudo bem. Movimentos bruscos geram um aviso.

**Acesse:** https://rodrigosilvacio.github.io/roboflow-identify/detector-queda/

## A lógica (e por que ela é assim)

| Ideia inicial | Problema | Como ficou |
|---|---|---|
| Detectar a pessoa com uma caixa | Caixa "deitada" também acontece ao abaixar, sentar ou deitar no sofá | **Esqueleto** (ombros, quadril, joelhos, tornozelos) com o MediaPipe Pose |
| Apitar quando a pessoa cai | Não diferencia "caiu e levantou" de "caiu e ficou" | **Duas fases:** suspeita (apito curto) e alarme se continuar no chão por X s |
| Movimento rápido = queda | Sentar rápido também é rápido | Queda exige **descida do quadril ou giro do tronco** e **corpo deitado** em seguida |
| Movimento brusco = qualquer coisa rápida | Acenar dispararia | Só o **centro do tronco** conta; braços não |
| Analisar no Roboflow | 0,5 s por chamada e milhares de chamadas por hora | Modelo **no navegador**, cerca de 30 quadros/s com GPU, custo zero, vídeo não sai do computador |

### Regras (`fall-logic.js`)

Tudo é medido em **comprimentos de tronco** (ombro até quadril), então funciona com a pessoa perto ou longe da câmera.

1. **Postura:** inclinação do tronco em relação à vertical (0° em pé, 90° deitado) e altura do corpo. Sem pernas visíveis (webcam de mesa), vale a inclinação.
2. **Descida rápida:** o quadril desce pelo menos 0,9 tronco a 2,2 troncos/s, medido do ponto mais alto da última 1 s até agora (funciona com 4 ou 30 quadros/s), **ou** o tronco gira 45° ou mais nesse intervalo.
3. **Suspeita de queda:** houve descida rápida há menos de 1,2 s e agora a pessoa está deitada (ou desceu muito). Apito curto.
4. **Alarme:** continua no chão pelo tempo configurado (padrão 4 s). Sirene até clicar em **"Estou bem"**.
5. **Recuperação:** se ficar em pé por 1,2 s durante a suspeita, ela é cancelada e registrada.
6. **Saiu do quadro após descida rápida:** também vira suspeita (pode ter caído para fora da imagem).
7. **Movimento brusco:** centro do tronco acima de 4,5 troncos/s, fora de uma descida, no máximo 1 aviso a cada 5 s.
8. **Opcional:** alarme se ficar deitado mais de 30 s, para desmaio lento, que não tem descida rápida.

A **sensibilidade** (1 a 5) multiplica os limites de velocidade e de descida.

## Testes

```bash
node detector-queda/tests/fall-logic.test.js
```

São 19 cenários com esqueletos sintéticos: parado, andando, sentando (normal e de uma vez), abaixando, queda com e sem recuperação, tombar de lado, cair para fora do quadro, sair andando, movimento brusco, desmaio lento, webcam só com tronco e quedas a 5 e 10 quadros/s.

Também foi testado com o modelo MediaPipe real no Chromium, usando vídeos como câmera falsa: uma pessoa real que tomba até o chão (gerou suspeita e alarme) e pedestres andando (nenhuma ocorrência).

## Dependências

O MediaPipe (`@mediapipe/tasks-vision` 0.10.14, licença Apache-2.0) e o modelo `pose_landmarker_lite` ficam em `vendor/mediapipe/` (na raiz do repositório, compartilhados com outros projetos), servidos pelo próprio site. Assim a página não depende de CDN externo. Se a cópia local falhar, a página tenta o CDN do Google como reserva. Não há conta, chave ou cobrança.

## Limitações do MVP

- **Uma pessoa por vez.** Com várias pessoas, o modelo acompanha uma delas.
- **O quadril precisa aparecer.** Câmera alta, mostrando o corpo inteiro, funciona melhor que webcam de mesa.
- **A aba precisa ficar aberta e visível.** Sem GPU, o modelo roda a poucos quadros/s, mas a lógica foi feita para funcionar assim.
- **Desmaio lento** só é pego com a opção de 30 s deitado.
- **Não é dispositivo médico.** É um protótipo de demonstração e não substitui acompanhamento humano.

## Próximos passos possíveis

1. Alerta remoto (WhatsApp ou e-mail) via Supabase quando o alarme tocar.
2. Câmera fixa com mini-PC e Roboflow Inference rodando um modelo de pose (YOLO26 Pose), para operação 24h.
3. Treinar um classificador de queda com vídeos do ambiente real, para reduzir alarmes falsos.

## Privacidade (LGPD)

- O vídeo é processado no navegador e **não é enviado** a nenhum servidor. Só o modelo é baixado.
- As miniaturas das ocorrências ficam apenas na aba.
- Em uso real (por exemplo, com um idoso em casa), é preciso consentimento e combinar quem recebe o alerta.
