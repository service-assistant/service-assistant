import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Pdf from 'react-native-pdf';

export default function PdfViewer({ source }: { source: any }) {
	return (
		<View style={styles.container}>
			<Pdf
				source={source}
				trustAllCerts={false}

				// --- KLUCZOWE ZMIANY TUTAJ ---
				fitPolicy={0} // 0 = Fit Width (Dopasuj do szerokości)
				spacing={10}  // Minimalny odstęp między stronami (opcjonalnie)

				renderActivityIndicator={() => (
					<ActivityIndicator color="#CC5500" size="large" /> // Zmieniłem na Twój pomarańczowy!
				)}
				onLoadComplete={(numberOfPages) => {
					console.log(`Loaded ${numberOfPages} pages`);
				}}
				onError={(error) => {
					console.log('PDF failed to load:', error);
				}}
				style={styles.pdf}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		width: '100%',
		height: '100%',
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#09090B',
	},
	pdf: {
		flex: 1,
		// Zamiast Dimensions używamy 100%, aby PDF wypełnił tylko swój "prawy panel"
		width: '100%',
		height: '100%',
		backgroundColor: '#09090B',
	}
});