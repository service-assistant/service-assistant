# Server side code for AI Service Assistant App

This part assumes that you've gone though main `README.md` file of the repository.

## Getting started

Most important commands are listed in `Makefile`. To learn about their usage just run:

```
make help
```

App should work on [http://localhost:8000](http://localhost:8000)

OpenAPI on [http://localhost:8000/docs](http://localhost:8000/docs)

## Environment variables

`.env.example` contains all environment variables that our app needs. Just copy it as `.env` and fill in with all data/secrets.

## Docker

For now we don't run any Docker services yet but there is `docker-compose.yml` file, just in case. To run it in the background, use:

```
docker-compose up -d
```

And to stop:

```
docker-compose down
```
