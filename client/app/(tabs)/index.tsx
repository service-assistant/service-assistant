import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation'; // <-- Add this missing import!

export default function Index() {
	useEffect(() => {
		// This forces the app to immediately check the physical sensor and stretch the UI
		ScreenOrientation.unlockAsync();
	}, []);
    // Zmień "/home" na nazwę pliku, który chcesz odpalić (bez .tsx)
    return <Redirect href="/home" />;
}