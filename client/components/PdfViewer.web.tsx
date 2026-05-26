import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

const PRIMARY_ORANGE = '#CC5500';

/**
 * PDF Viewer Component for Web.
 * NOTE: This component uses an HTML <iframe> as standard React Native PDF libraries
 * often lack full web support.
 */
const getPdfUri = (source: any) => {
	if (typeof source === 'string') return source;
	if (typeof source?.uri === 'string') return source.uri;
	return '';
};

export default function PdfViewer({ source }: { source: any }) {
	const pdfUri = getPdfUri(source);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setIsLoading(true);
		const fallbackTimer = setTimeout(() => setIsLoading(false), 4500);

		return () => clearTimeout(fallbackTimer);
	}, [pdfUri]);

	return (
		// The container uses overflow-hidden to crop the oversized iframe inside it
		<View className='flex-1 w-full h-full overflow-hidden bg-black relative'>
			<iframe
				// URL parameters hide the browser's default PDF viewer UI (toolbar, scrollbar)
				// and force the document to fit horizontally (view=FitH)
				src={`${pdfUri}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
				onLoad={() => requestAnimationFrame(() => setIsLoading(false))}
				style={{
					// Oversizing the iframe and using negative margins to hide
					// any remaining native browser scrollbars or borders
					width: '104%',
					height: '104%',
					marginLeft: '-2%',
					marginTop: '-2%',
					border: 'none',
					// CSS hack to simulate "Dark Mode" for the PDF content
					filter: 'grayscale(100%) invert(100%) brightness(0.9)',
				}}
				title='Instrukcja PDF'
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
