declare module "*.css";
declare module "*.pdf";

declare const process: {
  env: {
    AUTH_TOKEN?: string;
    AUTH_URL?: string;
    EXPO_PUBLIC_AUTH_TOKEN?: string;
    EXPO_PUBLIC_AUTH_URL?: string;
  };
};
