"""Export the trained PyTorch detector to a compact Android asset."""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

import torch

from wakeword import load_checkpoint


TENSOR_NAMES = [
    "features.window",
    "features.mel_filter",
    "cnn.0.weight",
    "cnn.0.bias",
    "cnn.1.weight",
    "cnn.1.bias",
    "cnn.1.running_mean",
    "cnn.1.running_var",
    "cnn.4.weight",
    "cnn.4.bias",
    "cnn.5.weight",
    "cnn.5.bias",
    "cnn.5.running_mean",
    "cnn.5.running_var",
    "cnn.8.weight",
    "cnn.8.bias",
    "head.2.weight",
    "head.2.bias",
    "head.5.weight",
    "head.5.bias",
]


def write_tensor(output, name: str, tensor: torch.Tensor) -> None:
    values = tensor.detach().cpu().contiguous().view(-1).float().tolist()
    encoded_name = name.encode("ascii")
    output.write(struct.pack("<H", len(encoded_name)))
    output.write(encoded_name)
    output.write(struct.pack("<I", len(values)))
    output.write(struct.pack(f"<{len(values)}f", *values))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, default=Path("checkpoints/fikso_cnn.pt"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../modules/wake-word/android/src/main/assets/fikso_cnn.bin"),
    )
    args = parser.parse_args()

    model, checkpoint = load_checkpoint(args.checkpoint)
    state = model.state_dict()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with args.output.open("wb") as output:
        output.write(b"FIKSO1")
        output.write(struct.pack("<H", len(TENSOR_NAMES)))
        for name in TENSOR_NAMES:
            write_tensor(output, name, state[name])
        output.write(struct.pack("<f", float(checkpoint.get("threshold", 0.28))))

    print(f"Exported {args.output} ({args.output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
