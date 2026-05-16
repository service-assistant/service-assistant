import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import Pdf from 'react-native-pdf';

/**
 * PDF Viewer Component.
 * NOTE: This component/view is primarily targeted and tested for Android.
 */
export default function PdfViewer({ source, page }: { source: any; page: number }) {
	return (
		<View className='flex-1 bg-black overflow-hidden justify-center items-center'>
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
				renderActivityIndicator={() => <ActivityIndicator color='#CC5500' size='large' />}
				onLoadComplete={(numberOfPages) => {
					console.log(`Loaded ${numberOfPages} pages`);
				}}
				onError={(error) => {
					console.log('PDF failed to load:', error);
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
		</View>
	);
}
