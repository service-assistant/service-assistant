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

type ThemeAwareLogoProps = Omit<ImageProps, 'style'> & {
	width: number;
	height: number;
	lightMode?: boolean;
	containerStyle?: StyleProp<ViewStyle>;
	imageStyle?: StyleProp<ImageStyle>;
};

const whitePixelMask = {
	filter: 'grayscale(1) brightness(0.52) contrast(100) invert(1)',
	mixBlendMode: 'multiply',
} as const;

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
					<Image
						{...imageProps}
						style={[dimensions, imageStyle, whitePixelMask] as ImageStyle}
					/>
				</View>
			)}
		</View>
	);
}
