import base64
from openai import AsyncOpenAI
import asyncio


async def describe_images(
    image_filenames: list[str],
    images_dir,
    client,
    model,
    concurrency: int = 8,
):
    semaphore = asyncio.Semaphore(concurrency)

    async def describe(image_filename):
        async with semaphore:
            description = await describe_image(
                image_path=str(images_dir / image_filename),
                client=client,
                model=model,
            )

            return image_filename, description

    return await asyncio.gather(
        *(describe(filename) for filename in image_filenames)
    )

async def describe_image(
    image_path: str,
    client: AsyncOpenAI,
    model: str,
) -> str:

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    base64_image = base64.b64encode(image_bytes).decode("utf-8")

    response = await client.responses.create(
        model=model,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": """
Describe this technical image for semantic search.

Include:
- what system or component it represents,
- the main components visible,
- connections between components,
- labels, connector names and identifiers if readable,
- important technical relationships.

Be concise and technically precise.
Do not invent information that cannot be determined from the image.
""",
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:image/png;base64,{base64_image}",
                        "detail": "high",
                    },
                ],
            }
        ],
    )

    return response.output_text
