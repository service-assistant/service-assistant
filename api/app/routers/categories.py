from datetime import datetime, timezone

from app.dependencies.auth import CurrentOrganizationDependency
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import CategoryDependency
from app.models import Category
from app.repositories import CategoryRepository
from app.schemas import CategoryCreate, CategoryRead, CategoryTreeRead, CategoryUpdate
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError, InvalidRequestError

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
    body: CategoryCreate,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    repository = CategoryRepository(session, organization_id)

    if body.parent_id is not None:
        parent = await repository.get(body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")

    category = Category(**body.model_dump())
    try:
        return await repository.add(category)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=404, detail="Parent category not found")
    except InvalidRequestError:
        # Parent was concurrently deleted after our insert committed but before
        # we could refresh it — ON DELETE CASCADE already removed this row.
        await session.rollback()
        raise HTTPException(status_code=404, detail="Parent category not found")


@router.get(
    "",
    response_model=list[CategoryRead],
    summary="List root categories",
    description="Returns top-level categories (those without a parent). Use /{id}/children to descend.",
)
async def list_root_categories(
    session: DbSessionDependency, organization_id: CurrentOrganizationDependency
):
    return await CategoryRepository(session, organization_id).list_roots()


@router.get(
    "/tree",
    response_model=list[CategoryTreeRead],
    summary="Get the category tree",
    description="Returns root categories with all descendants nested under `children`.",
)
async def get_category_tree(
    session: DbSessionDependency, organization_id: CurrentOrganizationDependency
):
    categories = await CategoryRepository(session, organization_id).list_all()

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
    category: CategoryDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    return await CategoryRepository(session, organization_id).list_children(category.id)


@router.get(
    "/{category_id}",
    response_model=CategoryRead,
    summary="Get a category",
    description="Returns a single category by its ID.",
    responses={404: {"description": "Category not found"}},
)
async def get_category(category: CategoryDependency):
    return category


async def _would_create_cycle(
    repository: CategoryRepository, category_id: int, new_parent_id: int
) -> bool:
    """Walk up the ancestor chain from new_parent_id, looking for category_id."""
    current_id: int | None = new_parent_id
    while current_id is not None:
        if current_id == category_id:
            return True
        current_id = await repository.get_parent_id(current_id)
    return False


@router.patch(
    "/{category_id}",
    response_model=CategoryRead,
    summary="Update a category",
    description="Partially updates a category. Only the fields provided in the request body are changed.",
    responses={
        404: {"description": "Category or parent category not found"},
        422: {"description": "The new parent would create a circular reference"},
    },
)
async def update_category(
    category: CategoryDependency,
    body: CategoryUpdate,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    repository = CategoryRepository(session, organization_id)
    updates = body.model_dump(exclude_unset=True)
    if "parent_id" in updates and updates["parent_id"] is not None:
        parent = await repository.get(updates["parent_id"])
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")
        if await _would_create_cycle(repository, category.id, updates["parent_id"]):
            raise HTTPException(
                status_code=422,
                detail="Cannot set parent: it would create a circular reference",
            )

    updates["updated_at"] = datetime.now(timezone.utc)
    return await repository.update(category, **updates)


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a category",
    description=(
        "Permanently deletes a category and all of its descendant categories. "
        "Fails with 409 if any devices still reference this category or any "
        "of its descendants."
    ),
    responses={
        404: {"description": "Category not found"},
        409: {"description": "Devices still reference this category or a descendant"},
    },
)
async def delete_category(
    category: CategoryDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    repository = CategoryRepository(session, organization_id)
    try:
        await repository.delete(category)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot delete category: devices still reference it or one of "
                "its descendant categories"
            ),
        )
