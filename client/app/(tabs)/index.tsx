import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function Index() {
    useEffect(() => {
        // Enable free screen rotation based on device sensors
        ScreenOrientation.unlockAsync();
    }, []);

    // Redirect to the main application route
    return <Redirect href="/home" />;
}