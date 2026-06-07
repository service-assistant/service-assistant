"""Shared audio, feature extraction and model code for the Fikso detector."""

from __future__ import annotations

import math
import wave
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn


@dataclass(frozen=True)
class AudioConfig:
    sample_rate: int = 16_000
    window_seconds: float = 1.5
    hop_seconds: float = 0.25
    n_fft: int = 512
    win_length: int = 400
    stft_hop: int = 160
    n_mels: int = 40
    f_min: float = 120.0
    f_max: float = 4_800.0
    preemphasis: float = 0.97

    @property
    def window_samples(self) -> int:
        return int(self.sample_rate * self.window_seconds)

    @property
    def hop_samples(self) -> int:
        return int(self.sample_rate * self.hop_seconds)

    def to_dict(self) -> dict:
        return asdict(self)


def load_wav(path: str | Path, target_rate: int = 16_000) -> np.ndarray:
    """Load a PCM WAV file as mono float32 and resample with linear interpolation."""
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        width = wav.getsampwidth()
        rate = wav.getframerate()
        frames = wav.readframes(wav.getnframes())
    if width != 2:
        raise ValueError(f"{path}: expected 16-bit PCM WAV, got {width * 8}-bit")
    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    audio = audio.reshape(-1, channels).mean(axis=1)
    if rate != target_rate:
        old_x = np.arange(len(audio), dtype=np.float32)
        new_len = round(len(audio) * target_rate / rate)
        new_x = np.linspace(0, max(0, len(audio) - 1), new_len, dtype=np.float32)
        audio = np.interp(new_x, old_x, audio).astype(np.float32)
    return audio


def fit_window(audio: np.ndarray, samples: int, rng: np.random.Generator | None = None) -> np.ndarray:
    """Crop or zero-pad audio to a fixed-size model window."""
    if len(audio) > samples:
        start = (len(audio) - samples) // 2 if rng is None else int(rng.integers(0, len(audio) - samples + 1))
        return audio[start : start + samples].copy()
    if len(audio) == samples:
        return audio.copy()
    missing = samples - len(audio)
    left = missing // 2 if rng is None else int(rng.integers(0, missing + 1))
    return np.pad(audio, (left, missing - left)).astype(np.float32)


def hz_to_mel(freq: float | torch.Tensor) -> float | torch.Tensor:
    return 2595.0 * torch.log10(1.0 + freq / 700.0) if isinstance(freq, torch.Tensor) else 2595.0 * math.log10(1.0 + freq / 700.0)


def mel_to_hz(mel: torch.Tensor) -> torch.Tensor:
    return 700.0 * (torch.pow(10.0, mel / 2595.0) - 1.0)


def make_mel_filter(config: AudioConfig) -> torch.Tensor:
    min_mel = hz_to_mel(config.f_min)
    max_mel = hz_to_mel(config.f_max)
    mel_points = torch.linspace(min_mel, max_mel, config.n_mels + 2)
    hz_points = mel_to_hz(mel_points)
    bins = torch.floor((config.n_fft + 1) * hz_points / config.sample_rate).long()
    filters = torch.zeros(config.n_mels, config.n_fft // 2 + 1)
    for index in range(config.n_mels):
        left, center, right = bins[index : index + 3].tolist()
        center = max(center, left + 1)
        right = max(right, center + 1)
        for freq_bin in range(left, min(center, filters.shape[1])):
            filters[index, freq_bin] = (freq_bin - left) / (center - left)
        for freq_bin in range(center, min(right, filters.shape[1])):
            filters[index, freq_bin] = (right - freq_bin) / (right - center)
    return filters


class LogMelSpectrogram(nn.Module):
    def __init__(self, config: AudioConfig):
        super().__init__()
        self.config = config
        self.register_buffer("window", torch.hann_window(config.win_length))
        self.register_buffer("mel_filter", make_mel_filter(config))

    def forward(self, audio: torch.Tensor) -> torch.Tensor:
        if self.config.preemphasis > 0:
            audio = torch.cat([audio[:, :1], audio[:, 1:] - self.config.preemphasis * audio[:, :-1]], dim=1)
        spectrum = torch.stft(
            audio,
            n_fft=self.config.n_fft,
            hop_length=self.config.stft_hop,
            win_length=self.config.win_length,
            window=self.window,
            return_complex=True,
        ).abs().pow(2)
        mel = torch.matmul(self.mel_filter, spectrum)
        features = torch.log(mel.clamp_min(1e-6))
        mean = features.mean(dim=(-2, -1), keepdim=True)
        std = features.std(dim=(-2, -1), keepdim=True).clamp_min(1e-5)
        return ((features - mean) / std).unsqueeze(1)


class WakeWordCNN(nn.Module):
    """Small CNN classifier over short log-mel windows."""

    def __init__(self, config: AudioConfig | None = None):
        super().__init__()
        self.config = config or AudioConfig()
        self.features = LogMelSpectrogram(self.config)
        self.cnn = nn.Sequential(
            nn.Conv2d(1, 12, kernel_size=3, padding=1),
            nn.BatchNorm2d(12),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(12, 24, kernel_size=3, padding=1),
            nn.BatchNorm2d(24),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(24, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((4, 8)),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.15),
            nn.Linear(32 * 4 * 8, 64),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(64, 1),
        )

    def forward(self, audio: torch.Tensor) -> torch.Tensor:
        return self.head(self.cnn(self.features(audio))).squeeze(1)


def load_checkpoint(path: str | Path, device: str = "cpu") -> tuple[WakeWordCNN, dict]:
    checkpoint = torch.load(path, map_location=device, weights_only=False)
    config = AudioConfig(**checkpoint["audio_config"])
    model = WakeWordCNN(config)
    model.load_state_dict(checkpoint["model_state"])
    model.to(device).eval()
    return model, checkpoint


@torch.inference_mode()
def predict_probability(model: WakeWordCNN, audio: np.ndarray, device: str = "cpu") -> float:
    window = fit_window(audio, model.config.window_samples)
    tensor = torch.from_numpy(window).unsqueeze(0).to(device)
    return float(torch.sigmoid(model(tensor))[0].cpu())


def iter_stream_windows(audio: np.ndarray, config: AudioConfig):
    if len(audio) < config.window_samples:
        yield 0, fit_window(audio, config.window_samples)
        return
    for start in range(0, len(audio) - config.window_samples + 1, config.hop_samples):
        yield start, audio[start : start + config.window_samples]


class DetectionSmoother:
    """Streaming head: require repeated scores and suppress duplicate detections."""

    def __init__(self, threshold: float, required_hits: int = 2, cooldown_seconds: float = 1.5):
        self.threshold = threshold
        self.required_hits = required_hits
        self.cooldown_seconds = cooldown_seconds
        self.hits = 0
        self.last_detection = -float("inf")

    def update(self, timestamp: float, probability: float) -> bool:
        self.hits = self.hits + 1 if probability >= self.threshold else 0
        if self.hits >= self.required_hits and timestamp - self.last_detection >= self.cooldown_seconds:
            self.last_detection = timestamp
            self.hits = 0
            return True
        return False
