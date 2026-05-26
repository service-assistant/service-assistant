import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Pdf from 'react-native-pdf';

const PRIMARY_ORANGE = '#CC5500';

/**
 * PDF Viewer Component.
 * NOTE: This component/view is primarily targeted and tested for Android.
 */
export default function PdfViewer({ source, page }: { source: any; page: number }) {
	const [isLoading, setIsLoading] = useState(true);
	const sourceKey = useMemo(() => {
		if (typeof source === 'string') return source;
		if (typeof source?.uri === 'string') return source.uri;
		return String(source);
	}, [source]);
	const hideLoader = useCallback(() => {
		requestAnimationFrame(() => setIsLoading(false));
	}, []);

	useEffect(() => {
		setIsLoading(true);
		const fallbackTimer = setTimeout(() => setIsLoading(false), 4500);

		return () => clearTimeout(fallbackTimer);
	}, [sourceKey, page]);

	return (
		<View className='flex-1 bg-black overflow-hidden justify-center items-center relative'>
			{/* 
              Android-specific configuration:
              - trustAllCerts: false prevents loading errors from certain sources
              - fitPolicy: 0 fits the document width to the screen
            */}
			<Pdf
				source={source}
				page={page}
				trustAllCerts={false}
				fitPolicy={0}
				spacing={0}
				renderActivityIndicator={() => (
					<View className='flex-1 bg-black items-center justify-center'>
						<ActivityIndicator color={PRIMARY_ORANGE} size='large' />
					</View>
				)}
				onLoadComplete={(numberOfPages) => {
					console.log(`Loaded ${numberOfPages} pages`);
					hideLoader();
				}}
				onPageChanged={() => {
					hideLoader();
				}}
				onError={(error) => {
					console.log('PDF failed to load:', error);
					setIsLoading(false);
				}}
				style={{
					flex: 1,
					width: '100%',
					height: '100%',
					backgroundColor: '#000000',
					// Scale 1.06 is used to eliminate extra margins/borders on Android
					transform: [{ scale: 1.06 }, { translateX: 0 }],
				}}
			/>
			{isLoading ? (
				<View className='absolute inset-0 bg-black items-center justify-center z-20'>
					<ActivityIndicator color={PRIMARY_ORANGE} size='large' />
					<Text className='text-neutral-400 text-[11px] font-bold uppercase tracking-widest mt-4'>
						Ladowanie pliku...
					</Text>
				</View>
			) : null}
		</View>
	);
}
