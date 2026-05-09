import React from 'react';
import { View } from 'react-native';

/**
 * PDF Viewer Component for Web.
 * NOTE: This component uses an HTML <iframe> as standard React Native PDF libraries 
 * often lack full web support.
 */
export default function PdfViewer({ source }: { source: any }) {
    return (
        // The container uses overflow-hidden to crop the oversized iframe inside it
        <View className="flex-1 w-full h-full overflow-hidden">
            <iframe
                // URL parameters hide the browser's default PDF viewer UI (toolbar, scrollbar)
                // and force the document to fit horizontally (view=FitH)
                src={`${source}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
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
        </View>
    );
}
