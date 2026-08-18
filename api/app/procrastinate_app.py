from procrastinate import App, PsycopgConnector
from procrastinate.testing import InMemoryConnector

from app.config import get_settings
from app.database import database_url_without_driver


if get_settings().env == "test":
    connector = InMemoryConnector()
else:
    connector = PsycopgConnector(
        conninfo=database_url_without_driver,
    )


app = App(
    connector=connector,
    import_paths=[
        "app.tasks.ingest",
    ],
)
