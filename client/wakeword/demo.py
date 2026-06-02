"""Real-time microphone or WAV-file streaming demo for the Fikso detector."""

from __future__ import annotations

import argparse
import queue
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import torch

from wakeword import DetectionSmoother, fit_window, iter_stream_windows, load_checkpoint, load_wav

MIN_ACTIVE_RMS = 1e-4
PRESETS = {
    "strict": (0.98, 3),
    "balanced": (0.90, 2),
    "sensitive": (0.80, 2),
}


def score_window(model, window, device):
    if float(np.sqrt(np.mean(np.square(window)))) < MIN_ACTIVE_RMS:
        return 0.0
    tensor = torch.from_numpy(window).unsqueeze(0).to(device)
    with torch.inference_mode():
        return float(torch.sigmoid(model(tensor))[0].cpu())


def print_detection(timestamp, probability):
    print(f"[WAKE WORD] t={timestamp:8.2f}s  score={probability:.3f}  wall_clock={datetime.now().isoformat(timespec='seconds')}")


def run_file(model, path, threshold, required_hits, device, verbose):
    config = model.config
    audio = load_wav(path, config.sample_rate)
    audio = np.pad(audio, (config.window_samples, config.window_samples))
    head = DetectionSmoother(threshold, required_hits=required_hits)
    for start, window in iter_stream_windows(audio, config):
        timestamp = (start + config.window_samples) / config.sample_rate
        probability = score_window(model, window, device)
        if verbose:
            print(f"t={timestamp:8.2f}s score={probability:.3f}")
        if head.update(timestamp, probability):
            print_detection(timestamp, probability)


def run_microphone(model, threshold, required_hits, device, verbose):
    try:
        import sounddevice as sd
    except ImportError as error:
        raise SystemExit("Microphone mode requires sounddevice: pip install sounddevice") from error
    config = model.config
    chunks = queue.Queue()
    buffer = np.zeros(0, dtype=np.float32)
    head = DetectionSmoother(threshold, required_hits=required_hits)
    started = time.monotonic()

    def callback(indata, frames, callback_time, status):
        if status:
            print(status)
        chunks.put(indata[:, 0].copy())

    print(f"Listening for 'Fikso'... threshold={threshold:.2f}, required_hits={required_hits}. Press Ctrl+C to stop.")
    with sd.InputStream(channels=1, samplerate=config.sample_rate, blocksize=config.hop_samples, dtype="float32", callback=callback):
        while True:
            buffer = np.concatenate([buffer, chunks.get()])
            if len(buffer) < config.window_samples:
                continue
            buffer = buffer[-config.window_samples :]
            probability = score_window(model, fit_window(buffer, config.window_samples), device)
            timestamp = time.monotonic() - started
            if verbose:
                print(f"t={timestamp:8.2f}s score={probability:.3f}")
            if head.update(timestamp, probability):
                print_detection(timestamp, probability)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, default=Path("checkpoints/fikso_cnn.pt"))
    parser.add_argument("--file", type=Path, help="Stream a WAV file instead of using the microphone")
    parser.add_argument("--threshold", type=float)
    parser.add_argument("--required-hits", type=int)
    parser.add_argument("--preset", choices=PRESETS)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    model, checkpoint = load_checkpoint(args.checkpoint, args.device)
    preset_threshold, preset_hits = PRESETS[args.preset] if args.preset else (
        checkpoint.get("streaming_threshold", PRESETS["strict"][0]),
        checkpoint.get("streaming_required_hits", PRESETS["strict"][1]),
    )
    threshold = args.threshold if args.threshold is not None else preset_threshold
    required_hits = args.required_hits if args.required_hits is not None else preset_hits
    if args.file:
        run_file(model, args.file, threshold, required_hits, args.device, args.verbose)
    else:
        run_microphone(model, threshold, required_hits, args.device, args.verbose)


if __name__ == "__main__":
    main()
