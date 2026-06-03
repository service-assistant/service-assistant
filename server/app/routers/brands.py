from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Brand

router = APIRouter()


class BrandCreate(BaseModel):
    name: str = Field(description="Display name of the brand.", examples=["Toyota"])
    logo_url: str | None = Field(
        default=None,
        description="Publicly accessible URL of the brand logo image.",
        examples=["https://example.com/logos/toyota.png"],
    )


class BrandUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        description="New display name.",
        examples=["Toyota Material Handling"],
    )
    logo_url: str | None = Field(
        default=None,
        description="New logo URL. Pass `null` to clear the existing value.",
        examples=["https://example.com/logos/toyota_v2.png"],
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Brand,
    summary="Create a brand",
    description="Creates a new device brand. The brand name must be unique.",
)
async def create_brand(body: BrandCreate, session: AsyncSession = Depends(get_session)):
    brand = Brand(**body.model_dump())
    session.add(brand)
    await session.commit()
    await session.refresh(brand)
    return brand


@router.get(
    "",
    response_model=list[Brand],
    summary="List brands",
    description="Returns all brands ordered by insertion order.",
)
async def list_brands(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Brand))
    return result.scalars().all()


@router.get(
    "/{brand_id}",
    response_model=Brand,
    summary="Get a brand",
    description="Returns a single brand by its ID.",
    responses={404: {"description": "Brand not found"}},
)
async def get_brand(brand_id: int, session: AsyncSession = Depends(get_session)):
    brand = await session.get(Brand, brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


@router.patch(
    "/{brand_id}",
    response_model=Brand,
    summary="Update a brand",
    description="Partially updates a brand. Only the fields provided in the request body are changed.",
    responses={404: {"description": "Brand not found"}},
)
async def update_brand(
    brand_id: int,
    body: BrandUpdate,
    session: AsyncSession = Depends(get_session),
):
    brand = await session.get(Brand, brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(brand, field, value)
    brand.updated_at = datetime.now(timezone.utc)
    session.add(brand)
    await session.commit()
    await session.refresh(brand)
    return brand


@router.delete(
    "/{brand_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a brand",
    description="Permanently deletes a brand. Fails with 409 if any devices still reference this brand.",
    responses={
        404: {"description": "Brand not found"},
        409: {"description": "Brand is referenced by one or more devices"},
    },
)
async def delete_brand(brand_id: int, session: AsyncSession = Depends(get_session)):
    brand = await session.get(Brand, brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    try:
        await session.delete(brand)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete brand: one or more devices reference it",
        )
