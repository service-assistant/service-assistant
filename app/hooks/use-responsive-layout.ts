import { Platform, useWindowDimensions } from 'react-native';

export type ResponsiveLayout =
	| 'largePortrait'
	| 'largeLandscape'
	| 'compactPortrait'
	| 'compactLandscape';

const getResponsiveLayout = (isLargeScreen: boolean, isPortrait: boolean): ResponsiveLayout => {
	if (isLargeScreen && isPortrait) return 'largePortrait';
	if (isLargeScreen) return 'largeLandscape';
	if (isPortrait) return 'compactPortrait';
	return 'compactLandscape';
};

export function useResponsiveLayout() {
	const { width, height } = useWindowDimensions();
	const isWeb = Platform.OS === 'web';
	const isPortrait = height > width;
	const isLargeScreen = Math.min(width, height) >= 600;
	const layout = getResponsiveLayout(isLargeScreen, isPortrait);

	return {
		width,
		isWeb,
		layout,
	};
}
