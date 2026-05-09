import pytest
from unittest.mock import AsyncMock, Mock
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.get_doc import get_pdf


@pytest.mark.asyncio
async def test_get_pdf_success(tmp_path):

    # fake pdf file
    pdf_file = tmp_path / "test.pdf"
    pdf_file.write_bytes(b"fake pdf content")

    # mock DB row
    mock_result = Mock()
    mock_result.fetchone.return_value = (str(pdf_file),)

    # mock session
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = mock_result

    response = await get_pdf(
        session=session,
        chunk_id=1,
    )

    assert isinstance(response, FileResponse)

    assert Path(response.path) == pdf_file

    session.execute.assert_called_once()


@pytest.mark.asyncio
async def test_get_pdf_chunk_not_found():

    # mock DB result
    mock_result = Mock()
    mock_result.fetchone.return_value = None

    # mock session
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc:
        await get_pdf(
            session=session,
            chunk_id=999,
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "Chunk not found"


@pytest.mark.asyncio
async def test_get_pdf_file_not_found():

    missing_path = "/tmp/this_file_does_not_exist.pdf"

    # mock DB row
    mock_result = Mock()
    mock_result.fetchone.return_value = (missing_path,)

    # mock session
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc:
        await get_pdf(
            session=session,
            chunk_id=1,
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "PDF file not found on disk"
