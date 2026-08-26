class BenchmarkCancelledError(RuntimeError):
    """Raised when an active benchmark run is cancelled by the administrator."""


class BenchmarkStorageError(RuntimeError):
    """Raised when benchmark documents cannot be read from R2."""
