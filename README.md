# AI Service Assistant

## Tech Stack

Client app is made with [React Native (Expo specifically)](https://docs.expo.dev/) in `client` directory.

Server app is made using [FastAPI](https://fastapi.tiangolo.com/) in `server` directory.

## Development

This project uses [asdf](https://asdf-vm.com/) to keep tool versions consistent. I recommend installing it now.

For backend/Python dependency management we use [poetry](https://python-poetry.org/). Don't install it directly but through `asdf`. To make sure `asdf` works with it correctly run:

```
asdf plugin add poetry https://github.com/asdf-community/asdf-poetry.git
```

With all that ready, run: 

```
asdf install
```

If you are on Windows or any other OS where `asdf` is not available, you can also install dependencies from `.tool-versions` globally.

Both client and server apps have `Makefile` files. They should make it easier for frontend people to run backend app and vice versa.

More about development in `./server/README.md` and `./client/README.md`.

## Rules & Advices

We work in 2-week long sprints, usually starting on Wednesday. We aim to finish each sprint at least 2-3 days before starting another one, that is around Sunday. With that approach we're able to choose upcoming priorities and do better planing before starting next sprint.

Jira Issues should be moved to "In Progress" and "Done" automatically, based on the state of related pull request. Remember to create branches with names suggested by Jira.

Start by working on issues with the highest priority first or issues that block tasks of other people. We should write tasks to minimize collisions but that's not always possible.

## Definition of Done

To mark task as done/completed it:

- MUST have written unit tests for the new functionality if relevant.
- MUST have written integration tests for the new functionality if relevant.
- MUST be reviewed and approved by at least 1 person on the backend.
- MUST pass all checks on GitHub Actions.
- MUST be made on a proper branch outgoing from the staging branch.
- MUST include thorough documentation in ANY form. For example on Google Drive, as a markdown file in the repository or function docstrings.
- SHOULD be made by 1 person.
- SHOULD be reviewed on the frontend in case of uncertainty.
- SHOULD use conventional commit naming.
- MAY be reviewed by other person if is about infrastructure.

## Deployment

Backend is deployed in 2 stages:

- production [https://asystent-serwisanta.pl/](https://asystent-serwisanta.pl/)
- staging [https://staging.asystent-serwisanta.pl/](https://staging.asystent-serwisanta.pl/)

When changes appear on the production, it means they are tested and reliable. Other intermediary changes come to the staging to allow testing in an environment similar to the production.

Client application is not yet distributed automatically. For now it's needed to build `.apk` file manually or use web version with limited funtionality.
