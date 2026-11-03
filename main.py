"""Identificação de cores com Roboflow Workflows.

Uso:
    python main.py caminho/para/imagem.jpg
"""
import json
import os
import sys

from dotenv import load_dotenv
from inference_sdk import InferenceHTTPClient

load_dotenv()

API_KEY = os.getenv("ROBOFLOW_API_KEY")
WORKSPACE_NAME = os.getenv("ROBOFLOW_WORKSPACE", "rodrigos-workspace-1ibon")
# O Base Workflow (my-first-project-mz66k) é vazio e protegido contra edição.
# O identificador-de-cores-mvp contém o bloco Dominant Color.
WORKFLOW_ID = os.getenv("ROBOFLOW_WORKFLOW_ID", "identificador-de-cores-mvp")


def main() -> None:
    if not API_KEY:
        sys.exit("ROBOFLOW_API_KEY não encontrada. Configure o arquivo .env.")

    image = sys.argv[1] if len(sys.argv) > 1 else "YOUR_IMAGE.jpg"

    # 1. Conecta ao Roboflow (snippet oficial)
    client = InferenceHTTPClient(
        api_url="https://serverless.roboflow.com",
        api_key=API_KEY,
    )

    # 2. Executa o workflow
    result = client.run_workflow(
        workspace_name=WORKSPACE_NAME,
        workflow_id=WORKFLOW_ID,
        images={"image": image},
        use_cache=True,  # cacheia a definição do workflow por 15 minutos
    )

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
