"""Moondream scene-QA driver: reads a manifest, answers vision questions, prints JSON.

Manifest (argv[1]):
  { "model": "moondream2",
    "items": [ { "id": "clipflow@t=4.2", "frame": "exports/trend-qa/frames/x.jpg",
                 "questions": ["..."] } ] }

stdout: { "items": [ { "id", "answers": [ { "question", "answer" } ] } ], "error": null }

Per-item failures degrade to an empty answer list; only environment/model
failures set "error" (the TS wrapper reports them as a skip).
"""
import json
import sys

def load_model(manifest: dict):
    import moondream as md

    model_id = manifest.get("model", "moondream2")
    # CUDA graph capture raises cudaErrorStreamCaptureInvalidated on older
    # GPUs (Turing RTX 2060). Graphs only speed up decode, so this advisory
    # QA run disables them outright instead of crashing at engine start.
    kwargs: dict = {"enable_cuda_graphs": False}
    if manifest.get("device"):
        kwargs["device"] = manifest["device"]
    return md.photon(model_id, **kwargs)


def main() -> int:
    with open(sys.argv[1], encoding="utf-8") as handle:
        manifest = json.load(handle)

    from PIL import Image

    model = load_model(manifest)
    out_items = []
    for item in manifest["items"]:
        answers = []
        try:
            image = Image.open(item["frame"]).convert("RGB")
            for question in item["questions"]:
                try:
                    result = model.query(image, question)
                    answers.append({"question": question, "answer": result["answer"]})
                except Exception as error:  # noqa: BLE001 - one bad query must not sink the batch
                    answers.append({"question": question, "answer": f"ERROR: {error}"})
        except Exception as error:  # noqa: BLE001
            answers.append({"question": "(frame)", "answer": f"ERROR: {error}"})
        out_items.append({"id": item["id"], "answers": answers})

    print(json.dumps({"items": out_items, "error": None}))
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 - report as structured error for the wrapper
        print(json.dumps({"items": [], "error": f"{error}"}))
        sys.exit(0)
