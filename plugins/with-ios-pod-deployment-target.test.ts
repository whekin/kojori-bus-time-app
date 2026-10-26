// @ts-nocheck
import { expect, it } from 'bun:test';
import { applyPodDeploymentFloor } from './with-ios-pod-deployment-target';

const podfile = `target 'KojoringTime' do
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`;

it('applies the dependency deployment floor after React Native post-install and preserves the surrounding hooks', () => {
  const result = applyPodDeploymentFloor(podfile);
  expect(result.indexOf('installer.pods_project.targets.each')).toBeGreaterThan(result.indexOf(':ccache_enabled'));
  expect(result).toContain("Gem::Version.new(deployment_target) < Gem::Version.new('15.1')");
  expect(result.endsWith('  end\nend\n')).toBe(true);
});

it('keeps a single floor when prebuild runs again', () => {
  const once = applyPodDeploymentFloor(podfile);
  const result = applyPodDeploymentFloor(once);
  expect(result).toEqual(once);
  expect(result.match(/# BEGIN KOJORI POD DEPLOYMENT FLOOR/g)).toHaveLength(1);
  expect(result.match(/installer.pods_project.targets.each/g)).toHaveLength(1);
});

it('fails clearly if a future Expo version removes the expected post-install seam', () => {
  expect(() => applyPodDeploymentFloor("platform :ios, '15.1'\n")).toThrow('Cannot find Expo');
});
