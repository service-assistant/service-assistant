import asyncio
from collections.abc import Awaitable
from contextlib import suppress
from typing import TypeVar

from app.benchmarks.exceptions import BenchmarkCancelledError

T = TypeVar("T")


def raise_if_cancelled(cancellation_event: asyncio.Event | None) -> None:
    if cancellation_event is not None and cancellation_event.is_set():
        raise BenchmarkCancelledError("Benchmark run was cancelled.")


async def await_with_cancellation(
    awaitable: Awaitable[T],
    cancellation_event: asyncio.Event | None,
) -> T:
    if cancellation_event is None:
        return await awaitable
    operation = asyncio.ensure_future(awaitable)
    if cancellation_event.is_set():
        operation.cancel()
        with suppress(asyncio.CancelledError):
            await operation
        raise BenchmarkCancelledError("Benchmark run was cancelled.")
    cancelled = asyncio.create_task(cancellation_event.wait())
    done, _pending = await asyncio.wait(
        {operation, cancelled}, return_when=asyncio.FIRST_COMPLETED
    )
    if cancelled in done:
        operation.cancel()
        with suppress(asyncio.CancelledError):
            await operation
        raise BenchmarkCancelledError("Benchmark run was cancelled.")
    cancelled.cancel()
    with suppress(asyncio.CancelledError):
        await cancelled
    return await operation
