import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "Sahaay",
  slug: "sahaay",
  owner: "vnaysngh94",
  icon: "./assets/icon.png",
  scheme: "sahaay",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.sahaay.app",
    appleTeamId: process.env.APPLE_TEAM_ID,
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
    "./plugins/with-ios-build-scripts",
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
  // Public project identity, shared by local and EAS builds.
  extra: { eas: { projectId: "e2693b35-ca7b-4539-a57b-c23512fa2da3" } },
};
export default config;
