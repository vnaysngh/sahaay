// Expo loads local config plugins through CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

function configureBuildScripts(project) {
  const targets = Object.values(project.pbxNativeTargetSection()).filter(
    (target) => target && typeof target === "object" &&
      target.productType === '"com.apple.product-type.application"',
  );
  if (targets.length !== 1)
    throw new Error("Expected one iOS app target; review build script configuration.");
  // CocoaPods writes its resource list outside declared script outputs. This
  // setting affects build scripts only, not the installed app's sandbox.
  for (const [, configuration] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
    project, targets[0].buildConfigurationList,
  )) {
    configuration.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = "NO";
  }
  return project;
}

module.exports = function withIosBuildScripts(config) {
  return withXcodeProject(config, (mod) => {
    mod.modResults = configureBuildScripts(mod.modResults);
    return mod;
  });
};
module.exports.configureBuildScripts = configureBuildScripts;
