from dotenv import load_dotenv

load_dotenv()  # must be called before other imports to make `.env` variable accessible

from fastapi import FastAPI  # noqa: E402
from app.routers import ai  # noqa: E402

app = FastAPI()

app.include_router(ai.router)
