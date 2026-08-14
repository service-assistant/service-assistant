import asyncio
import threading

import pytest

from app.services.async_utils import run_blocking


async def test_cancellation_waits_for_blocking_work_to_finish():
    started = threading.Event()
    release = threading.Event()
    finished = threading.Event()

    def blocking_work() -> None:
        started.set()
        release.wait(timeout=1)
        finished.set()

    task = asyncio.create_task(run_blocking(blocking_work))
    while not started.is_set():
        await asyncio.sleep(0)

    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()

    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert finished.is_set()
