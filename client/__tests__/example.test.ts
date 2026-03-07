/**
 * Example test structure
 */
const add = (a: number, b: number) => a + b;

describe('function add()', () => {
	test('returns 4 for add(2,2)', () => {
		expect(add(2, 2)).toEqual(4);
	});

	test('returns 7 for add(3, 4)', () => {
		expect(add(3, 4)).toEqual(7);
	});
});
