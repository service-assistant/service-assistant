const store = new Map();

module.exports = {
	__esModule: true,
	getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
	setItemAsync: jest.fn(async (key, value) => {
		store.set(key, value);
	}),
	deleteItemAsync: jest.fn(async (key) => {
		store.delete(key);
	}),
};
