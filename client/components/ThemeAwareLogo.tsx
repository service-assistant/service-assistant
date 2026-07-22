import React from 'react';
import {
	Image,
	StyleSheet,
	View,
	type ImageProps,
	type ImageStyle,
	type StyleProp,
	type ViewStyle,
} from 'react-native';
import {
	ColorMatrix,
	concatColorMatrices,
	luminanceToAlpha,
	threshold,
} from 'react-native-color-matrix-image-filters';

type ThemeAwareLogoProps = Omit<ImageProps, 'style'> & {
	width: number;
	height: number;
	lightMode?: boolean;
	containerStyle?: StyleProp<ViewStyle>;
	imageStyle?: StyleProp<ImageStyle>;
};

// Threshold 24/25.5 keeps the overlay limited to pixels that are almost pure white.
// Converting that result to alpha produces a black mask without recolouring the logo below it.
const WHITE_PIXEL_MASK = concatColorMatrices(threshold(24), luminanceToAlpha());

export default function ThemeAwareLogo({
	width,
	height,
	lightMode = false,
	containerStyle,
	imageStyle,
	onError,
	...imageProps
}: ThemeAwareLogoProps) {
	const dimensions = { width, height };

	return (
		<View style={[dimensions, containerStyle]}>
			<Image {...imageProps} onError={onError} style={[dimensions, imageStyle]} />
			{lightMode && (
				<View pointerEvents='none' style={StyleSheet.absoluteFill}>
					<ColorMatrix matrix={WHITE_PIXEL_MASK}>
						<Image {...imageProps} style={[dimensions, imageStyle]} />
					</ColorMatrix>
				</View>
			)}
		</View>
	);
}
