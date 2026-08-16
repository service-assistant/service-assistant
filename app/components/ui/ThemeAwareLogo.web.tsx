import React, { useId } from 'react';
import {
	Image,
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
	const filterId = `white-to-black-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const lightModeStyle = lightMode ? ({ filter: `url(#${filterId})` } as ImageStyle) : undefined;

	return (
		<View style={[dimensions, containerStyle]}>
			{lightMode && (
				<svg aria-hidden width='0' height='0' style={{ position: 'absolute' }}>
					<filter id={filterId} colorInterpolationFilters='sRGB'>
						<feColorMatrix
							in='SourceGraphic'
							result='whiteLuminance'
							values='0 0 0 0 0
								0 0 0 0 0
								0 0 0 0 0
								0.2126 0.7152 0.0722 0 0'
						/>
						<feComponentTransfer in='whiteLuminance' result='whiteMask'>
							<feFuncA
								type='discrete'
								tableValues='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1'
							/>
						</feComponentTransfer>
						<feComposite
							in='SourceGraphic'
							in2='whiteMask'
							operator='out'
							result='nonWhite'
						/>
						<feFlood floodColor='#000000' result='black' />
						<feComposite in='black' in2='whiteMask' operator='in' result='blackWhite' />
						<feMerge>
							<feMergeNode in='nonWhite' />
							<feMergeNode in='blackWhite' />
						</feMerge>
					</filter>
				</svg>
			)}
			<Image
				{...imageProps}
				onError={onError}
				style={[dimensions, imageStyle, lightModeStyle]}
			/>
		</View>
	);
}
