import { Redirect } from 'expo-router';

export default function Index() {
	// Redirect to the main application route
	return <Redirect href='/home' />;
}
