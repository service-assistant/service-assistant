import { Redirect } from 'expo-router';

export default function Index() {
    // Zmień "/home" na nazwę pliku, który chcesz odpalić (bez .tsx)
    return <Redirect href="/home" />;
}