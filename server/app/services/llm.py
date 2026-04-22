from collections.abc import AsyncGenerator
# TODO: construct query to LLM and use correct Pydantic types


async def query(question: str, chunks: list[str]) -> AsyncGenerator[str, None]:
    tokens = "Lorem ipsum dolor sit amet consectetur adipisicing elit. Neque deleniti accusantium aliquid dolores soluta nisi, corporis unde sit quaerat? Aut voluptatum mollitia possimus rem. Dolore sint facilis animi assumenda accusamus quasi officiis in, similique aperiam mollitia voluptates quia non enim provident, amet delectus minima odit nisi sequi voluptatibus. Beatae mollitia odit debitis deserunt, minus possimus? Suscipit fugit pariatur beatae quisquam voluptates alias enim ad aliquid porro dolor, rerum consequuntur excepturi! Placeat voluptates necessitatibus maxime dolorum, culpa quibusdam? Maiores fuga sit veritatis. Earum veritatis quo quas sequi non? Mollitia libero quasi sint aut corporis iure vel dicta ipsa et nam suscipit, asperiores quas vitae magni rem necessitatibus doloremque repellat quaerat? Recusandae omnis illo rem? Quidem ad blanditiis veniam eligendi natus, ut alias deserunt? Quod, minus doloremque doloribus quas vitae iusto suscipit autem adipisci ullam aut. Est deleniti dolor temporibus modi, quidem fugiat, eveniet asperiores perspiciatis iste eius suscipit corrupti aspernatur deserunt facere pariatur! Repudiandae perspiciatis eum omnis, aliquam possimus ratione, ut magni mollitia totam, assumenda a corporis corrupti vero dolor excepturi impedit harum tenetur tempora non ipsa rerum? Sit dolores iure nesciunt numquam libero magnam debitis minima aut ab optio possimus harum, velit, ipsum animi, consequatur error mollitia soluta cumque? Voluptatum.".split(
        " "
    )
    for token in tokens:
        yield token
