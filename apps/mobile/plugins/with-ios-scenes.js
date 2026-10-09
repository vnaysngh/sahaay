const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// Expo's scene delegate owns window creation and forwards lifecycle/deep-link
// events to the existing app delegate. Keep this in prebuild, not generated ios/.
module.exports = function withIosScenes(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift")
      throw new Error("Sahaay's iOS scene configuration requires a Swift AppDelegate.");
    let source = mod.modResults.contents;
    if (!source.includes("ExpoReactNativeFactoryProvider")) {
      const declaration = "class AppDelegate: ExpoAppDelegate {";
      if (!source.includes(declaration))
        throw new Error("Expo AppDelegate template changed; review scene integration.");
      source = source.replace(declaration,
        "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
    }
    const legacyWindow = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s+factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s+#endif/;
    source = source.replace(legacyWindow,
      "// ExpoAppSceneDelegate creates the window and starts React Native.");
    if (source.includes("window = UIWindow(frame: UIScreen.main.bounds)"))
      throw new Error("Legacy window startup remains; review Expo scene integration.");
    mod.modResults.contents = source;
    return mod;
  });
};
