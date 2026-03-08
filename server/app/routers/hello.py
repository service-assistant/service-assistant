from fastapi import APIRouter

router = APIRouter(prefix="/hello", tags=["hello"])


@router.get("/")
def hello():
    return {"hello": "world"}
