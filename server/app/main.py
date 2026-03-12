from fastapi import FastAPI
from app.routers import ai

app = FastAPI()

app.include_router(ai.router)
