# AI Service Assistant

## Code split

Client app is made with [React Native (Expo specifically)](https://docs.expo.dev/) in `client` directory.

Server app is made using [FastAPI](https://fastapi.tiangolo.com/) in `server` directory.

## Tool versions

This project uses [asdf](https://asdf-vm.com/) to keep tool versions consistent. 

For backend/Python dependency management we use [poetry](https://python-poetry.org/). To make sure `asdf` works with it correctly run:

```
asdf plugin add poetry https://github.com/asdf-community/asdf-poetry.git
```

With all that ready, run: 

```
asdf install
```

## Makefile

Both client and server apps have `Makefile` files. They should make it easier for Frontend people to run backend app and vice versa.

## Recommended learning resources

### Backend:

- [Python Documentation](https://docs.python.org/3/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/learn/)
- [Poetry Documentation](https://python-poetry.org/docs/)

### Frontend:

- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Documentation](https://docs.expo.dev/)

