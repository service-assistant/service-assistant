# AI Service Assistant

## Code split

Client app is made with [React Native (Expo specifically)](https://docs.expo.dev/) in `client` directory.

Server app is made using [FastAPI](https://fastapi.tiangolo.com/) in `server` directory.

## Tool versions

This project uses [asdf](https://asdf-vm.com/) to keep tool versions consistent. I recommend installing it now.

For backend/Python dependency management we use [poetry](https://python-poetry.org/). Don't install it directly but through `asdf`. To make sure `asdf` works with it correctly run:

```
asdf plugin add poetry https://github.com/asdf-community/asdf-poetry.git
```

With all that ready, run: 

```
asdf install
```

## Makefile

Both client and server apps have `Makefile` files. They should make it easier for frontend people to run backend app and vice versa.

## Recommended learning resources

### Backend:

- [Python Documentation](https://docs.python.org/3/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/learn/)
- [Poetry Documentation](https://python-poetry.org/docs/)

### Frontend:

- [TypeScript for JS Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Documentation](https://docs.expo.dev/)


## Deployment

Backend app is configured for automatical deployment from `main` branch to [https://service-assistant.fly.dev](https://service-assistant.fly.dev).
