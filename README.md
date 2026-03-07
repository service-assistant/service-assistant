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
