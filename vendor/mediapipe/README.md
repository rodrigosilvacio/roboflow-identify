# MediaPipe Tasks Vision (cópia local)

Cópia local dos arquivos do MediaPipe usados pelo Detector de Queda, pela Avaliação do Cliente e pela Vitrine por Gestos, para as páginas não dependerem de CDN externo.

| Arquivo | Origem |
|---|---|
| `vision_bundle.mjs`, `wasm/*`, `package.json` | pacote npm `@mediapipe/tasks-vision@0.10.14` |
| `pose_landmarker_lite.task` | `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/` |
| `face_landmarker.task` | `storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/` |
| `hand_landmarker.task` | `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/` |

Licença: Apache-2.0 (Google). Para atualizar, baixe a nova versão do pacote e do modelo e substitua estes arquivos.
