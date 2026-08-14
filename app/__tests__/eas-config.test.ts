import fs from 'fs';
import path from 'path';

type EasConfig = {
	build?: {
		preview?: {
			distribution?: string;
			environment?: string;
			android?: {
				buildType?: string;
			};
		};
		production?: {
			autoIncrement?: boolean;
		};
	};
};

const readEasConfig = () => {
	const configPath = path.join(__dirname, '..', 'eas.json');
	return JSON.parse(fs.readFileSync(configPath, 'utf8')) as EasConfig;
};

describe('eas config', () => {
	test('builds preview Android artifacts as APKs with the preview EAS environment', () => {
		const config = readEasConfig();

		expect(config.build?.preview).toMatchObject({
			distribution: 'internal',
			environment: 'preview',
			android: {
				buildType: 'apk',
			},
		});
	});

	test('keeps production builds auto-incremented', () => {
		const config = readEasConfig();

		expect(config.build?.production?.autoIncrement).toBe(true);
	});
});
