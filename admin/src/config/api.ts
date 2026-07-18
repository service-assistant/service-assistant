import Constants from "expo-constants";

type AppExtra = {
  authUrl?: string;
};

const configuredAuthUrl =
  (Constants.expoConfig?.extra as AppExtra | undefined)?.authUrl ??
  process.env.EXPO_PUBLIC_AUTH_URL ??
  "";

export const AUTH_URL = configuredAuthUrl.trim().replace(/\/+$/, "");

export function apiUrl(path: string) {
  if (!AUTH_URL) {
    throw new Error("Brak AUTH_URL w procesie Expo. Zrestartuj dev server po zmianie .env.");
  }

  return `${AUTH_URL}/${path.replace(/^\/+/, "")}`;
}
