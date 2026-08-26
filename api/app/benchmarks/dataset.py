from pathlib import Path

from app.benchmarks.models import BenchmarkDataset


def load_benchmark_dataset() -> BenchmarkDataset:
    dataset_path = Path(__file__).parent.parent / "benchmarks" / "cases.json"
    return BenchmarkDataset.model_validate_json(
        dataset_path.read_text(encoding="utf-8")
    )
