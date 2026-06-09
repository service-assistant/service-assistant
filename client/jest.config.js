/** @type {import("jest").Config} **/
module.exports = {
	testEnvironment: 'node',
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				tsconfig: {
					jsx: 'react',
				},
			},
		],
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
		'\\.(png|jpg|jpeg|gif|webp|pdf)$': '<rootDir>/test-utils/file-mock.js',
	},
};
