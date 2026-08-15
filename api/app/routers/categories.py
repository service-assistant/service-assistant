from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models import Category
from app.schemas import CategoryCreate, CategoryRead, CategoryTreeRead, CategoryUpdate

router = APIRouter()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CategoryRead,
    summary="Create a category",
    description="Creates a new category, optionally nested under a parent category.",
    responses={404: {"description": "Parent category not found"}},
)
async def create_category(
    body: CategoryCreate, session: AsyncSession = Depends(get_session)
):
    if body.parent_id is not None:
        parent = await session.get(Category, body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")

    category = Category(**body.model_dump())
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


@router.get(
    "",
    response_model=list[CategoryRead],
    summary="List categories",
    description="Returns all categories, flat, ordered by insertion order.",
)
async def list_categories(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Category))
    return result.scalars().all()


@router.get(
    "/tree",
    response_model=list[CategoryTreeRead],
    summary="Get the category tree",
    description="Returns root categories with all descendants nested under `children`.",
)
async def get_category_tree(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Category))
    categories = result.scalars().all()

    by_parent: dict[int | None, list[Category]] = {}
    for category in categories:
        by_parent.setdefault(category.parent_id, []).append(category)

    def build(category: Category) -> CategoryTreeRead:
        return CategoryTreeRead(
            **CategoryRead.model_validate(category).model_dump(),
            children=[build(child) for child in by_parent.get(category.id, [])],
        )

    return [build(root) for root in by_parent.get(None, [])]


@router.get(
    "/{category_id}/children",
    response_model=list[CategoryRead],
    summary="List direct children of a category",
    description="Returns the direct children of a category (not recursive).",
    responses={404: {"description": "Category not found"}},
)
async def list_category_children(
    category_id: int, session: AsyncSession = Depends(get_session)
):
    category = await session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    result = await session.execute(
        select(Category).where(Category.parent_id == category_id)
    )
    return result.scalars().all()


@router.get(
    "/{category_id}",
    response_model=CategoryRead,
    summary="Get a category",
    description="Returns a single category by its ID.",
    responses={404: {"description": "Category not found"}},
)
async def get_category(category_id: int, session: AsyncSession = Depends(get_session)):
    category = await session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.patch(
    "/{category_id}",
    response_model=CategoryRead,
    summary="Update a category",
    description="Partially updates a category. Only the fields provided in the request body are changed.",
    responses={
        404: {"description": "Category or parent category not found"},
        422: {"description": "A category cannot be its own parent"},
    },
)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    session: AsyncSession = Depends(get_session),
):
    category = await session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    updates = body.model_dump(exclude_unset=True)
    if "parent_id" in updates and updates["parent_id"] is not None:
        if updates["parent_id"] == category_id:
            raise HTTPException(
                status_code=422, detail="A category cannot be its own parent"
            )
        parent = await session.get(Category, updates["parent_id"])
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")

    for field, value in updates.items():
        setattr(category, field, value)
    category.updated_at = datetime.now(timezone.utc)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a category",
    description="Permanently deletes a category. Fails with 409 if it has child categories or devices still reference it.",
    responses={
        404: {"description": "Category not found"},
        409: {
            "description": "Category has children or is referenced by one or more devices"
        },
    },
)
async def delete_category(
    category_id: int, session: AsyncSession = Depends(get_session)
):
    category = await session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    try:
        await session.delete(category)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete category: it has children or is referenced by devices",
        )
