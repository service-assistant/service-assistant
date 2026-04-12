import React from 'react';
import { View } from 'react-native';
import Pdf from 'react-native-pdf';

export default function PdfViewer({ source }: { source: any }) {
	return (
		<View style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#09090B' }}>
			<Pdf
				trustAllCerts={false}
				source={source}
				onLoadComplete={(numberOfPages) => {
					console.log(`Wczytano PDF. Liczba stron: ${numberOfPages}`);
				}}
				onError={(error) => {
					console.log('Błąd wczytywania PDF:', error);
				}}
				style={{
					flex: 1,
					width: '100%',
					height: '100%',
					backgroundColor: '#09090B',
				}}
			/>
		</View>
	);
}
