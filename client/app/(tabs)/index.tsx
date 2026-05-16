import { Redirect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';

export default function Index() {
	useEffect(() => {
		// Enable free screen rotation based on device sensors
		ScreenOrientation.unlockAsync();
	}, []);

	// Redirect to the main application route
	return <Redirect href='/home' />;
}
