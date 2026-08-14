/** @type {import("jest").Config} **/
module.exports = {
	testEnvironment: 'node',
	setupFiles: ['<rootDir>/test-utils/jest.setup.js'],
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
		'^expo-constants$': '<rootDir>/test-utils/expo-constants-mock.js',
		'^react-native-color-matrix-image-filters$':
			'<rootDir>/test-utils/color-matrix-image-filters-mock.js',
		'\\.(png|jpg|jpeg|gif|webp|pdf)$': '<rootDir>/test-utils/file-mock.js',
	},
};
