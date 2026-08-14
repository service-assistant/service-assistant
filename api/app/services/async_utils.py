import asyncio
from collections.abc import Callable
from typing import ParamSpec, TypeVar


P = ParamSpec("P")
R = TypeVar("R")


async def run_blocking(
    function: Callable[P, R], *args: P.args, **kwargs: P.kwargs
) -> R:
    """Run blocking work without abandoning it midway when its caller is cancelled."""
    task = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        try:
            await task
        except Exception:
            pass
        raise
