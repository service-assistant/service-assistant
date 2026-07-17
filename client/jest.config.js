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
		'^react-native-color-matrix-image-filters$':
			'<rootDir>/test-utils/color-matrix-image-filters-mock.js',
		'\\.(png|jpg|jpeg|gif|webp|pdf)$': '<rootDir>/test-utils/file-mock.js',
	},
};
