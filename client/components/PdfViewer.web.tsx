import React from 'react';
import { View } from 'react-native';

export default function PdfViewer({ source }: { source: any }) {
	return (
		<View style={{ flex: 1, width: '100%', height: '100%', overflow: 'hidden' }}>
			<iframe
				src={`${source}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
				style={{
					width: '104%',
					height: '104%',
					marginLeft: '-2%',
					marginTop: '-2%',
					border: 'none',
					filter: 'grayscale(100%) invert(96.5%) brightness(0.9)',
				}}
				title='Instrukcja PDF'
			/>
		</View>
	);
}
