declare module 'expo-camera' {
	import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from 'react';
	import type { View } from 'react-native';

	export type CameraCapturedPicture = {
		uri: string;
		width?: number;
		height?: number;
		base64?: string;
	};

	export type CameraPermissionResponse = {
		granted: boolean;
		canAskAgain?: boolean;
		status?: string;
	};

	export type CameraViewProps = {
		facing?: 'front' | 'back';
		flash?: 'off' | 'on' | 'auto';
		style?: ComponentProps<typeof View>['style'];
	};

	export type CameraViewRef = {
		takePictureAsync(options?: {
			quality?: number;
			base64?: boolean;
			skipProcessing?: boolean;
			shutterSound?: boolean;
			flash?: 'off' | 'on' | 'auto';
		}): Promise<CameraCapturedPicture>;
	};

	export const CameraView: ForwardRefExoticComponent<
		CameraViewProps & RefAttributes<CameraViewRef>
	>;

	export function useCameraPermissions(): [
		CameraPermissionResponse | null,
		() => Promise<CameraPermissionResponse>,
	];
}
