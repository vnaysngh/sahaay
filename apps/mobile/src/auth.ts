import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { SahaayClient } from "@sahaay/api-client";
import { fetch as expoFetch } from "expo/fetch";
export const baseURL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme: "sahaay",
      storagePrefix: "sahaay",
      storage: SecureStore,
    }),
  ],
});
export const api = new SahaayClient({
  baseURL,
  cookie: () => authClient.getCookie(),
  fetch: expoFetch as typeof fetch,
  unauthorized: () => {
    void authClient.getSession({ query: { disableCookieCache: true } });
  },
});
