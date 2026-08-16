import pytest

from app.config import get_settings


@pytest.fixture
def settings(tmp_path):
    settings = get_settings()
    settings.attachments_dir = tmp_path
    return settings
