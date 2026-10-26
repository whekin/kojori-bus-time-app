const { withPodfile } = require('expo/config-plugins');

const BEGIN = '# BEGIN KOJORI POD DEPLOYMENT FLOOR';
const END = '# END KOJORI POD DEPLOYMENT FLOOR';

function applyPodDeploymentFloor(contents) {
  // Keep the generated native project reproducible across repeated prebuilds.
  const clean = contents.replace(/\n[ \t\n]*# BEGIN KOJORI POD DEPLOYMENT FLOOR[\s\S]*?# END KOJORI POD DEPLOYMENT FLOOR[ \t]*\n(?:[ \t]*\n)*/g, '\n');
  const postInstall = /react_native_post_install\([\s\S]*?\n[ \t]*\)/;
  if (!postInstall.test(clean)) throw new Error('Cannot find Expo react_native_post_install in the iOS Podfile');
  const floor = `
    ${BEGIN}
    # Xcode 27 rejects the old deployment targets in some resource-bundle pods.
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_configuration|
        deployment_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if deployment_target.nil? || (Gem::Version.correct?(deployment_target.to_s) && Gem::Version.new(deployment_target) < Gem::Version.new('15.1'))
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
    ${END}
`;
  return clean.replace(postInstall, match => match + '\n' + floor);
}

module.exports = config => withPodfile(config, mod => {
  mod.modResults.contents = applyPodDeploymentFloor(mod.modResults.contents);
  return mod;
});
module.exports.applyPodDeploymentFloor = applyPodDeploymentFloor;
