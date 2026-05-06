import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Pdf from 'react-native-pdf';

export default function PdfViewer({ source }: { source: any }) {
    return (
        <View style={styles.container}>
            <Pdf
                source={source}
                trustAllCerts={false}
                fitPolicy={0}
                spacing={0}  
                renderActivityIndicator={() => (
                    <ActivityIndicator color="#CC5500" size="large" />
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
        backgroundColor: '#000000', 
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pdf: {
        flex: 1,
        width: '100%', // Zwracamy na 100%
        height: '100%',
        backgroundColor: '#000000', 
        
        transform: [{ scale: 1.06 }, { translateX: 0 }], 
    }
});