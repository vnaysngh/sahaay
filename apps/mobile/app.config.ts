import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "Sahaay",
  slug: "sahaay",
  icon: "./assets/icon.png",
  scheme: "sahaay",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.sahaay.app",
    supportsTablet: true,
    entitlements: {
      "com.apple.security.application-groups": ["group.com.sahaay.app"],
    },
  },
  android: {
    package: "com.sahaay.app",
    allowBackup: false,
    intentFilters: [
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [{ mimeType: "text/plain" }],
      },
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [{ mimeType: "image/*" }],
      },
      {
        action: "SEND_MULTIPLE",
        category: ["DEFAULT"],
        data: [{ mimeType: "image/*" }],
      },
    ],
  },
  plugins: [
    "./plugins/with-ios-scenes",
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: "Choose images to send to Sahaay.",
        cameraPermission: "Take a photo to send to Sahaay.",
      },
    ],
    [
      "expo-audio",
      { microphonePermission: "Record a voice message for Sahaay." },
    ],
    "expo-notifications",
    "@bacons/apple-targets",
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } },
};
export default config;
