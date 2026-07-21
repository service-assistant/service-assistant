import type { PropsWithChildren } from 'react';
import { View, type ViewStyle } from 'react-native';

/**
 * `react-native-color-matrix-image-filters` uses `codegenNativeComponent`, which can't be
 * bundled for web. This never actually renders on web (callers gate on `Platform.OS`), but the
 * module still needs a web-safe stand-in so Metro's web bundle doesn't try to load the native one.
 */
export const Invert = ({ style, children }: PropsWithChildren<{ style?: ViewStyle }>) => (
	<View style={[style, { filter: 'invert(100%)' } as ViewStyle]}>{children}</View>
);
