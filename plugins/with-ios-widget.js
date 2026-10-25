const { withXcodeProject } = require('expo/config-plugins');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TARGET = 'KojoriBusWidget';

module.exports = function withIosWidget(config) {
  return withXcodeProject(config, mod => {
    const root = mod.modRequest.projectRoot;
    const folder = path.join(mod.modRequest.platformProjectRoot, TARGET);
    fs.mkdirSync(folder, { recursive: true });
    for (const file of ['WidgetSchedule.swift', 'KojoriWidget.swift', 'Localizable.xcstrings']) {
      fs.copyFileSync(path.join(root, 'native/ios-widget', file), path.join(folder, file));
    }
    execFileSync('bun', [path.join(root, 'scripts/build-ios-widget-data.ts'), path.join(folder, 'timetable.json')], { cwd: root });

    const project = mod.modResults;
    // Expo prebuild can run repeatedly over the same native project.
    let nativeTarget = Object.values(project.pbxNativeTargetSection())
      .find(item => item?.name?.replaceAll('"', '') === TARGET);
    if (!nativeTarget) {
      const target = project.addTarget(TARGET, 'app_extension', TARGET, `${config.ios.bundleIdentifier}.widget`);
      nativeTarget = target.pbxNativeTarget;
      nativeTarget.name = TARGET;
      nativeTarget.productName = TARGET;
      const product = project.pbxFileReferenceSection()[nativeTarget.productReference];
      for (const key of Object.keys(product)) {
        if (product[key] === undefined) delete product[key];
      }
      const group = project.pbxCreateGroup(TARGET, TARGET);
      project.addToPbxGroup(group, project.getFirstProject().firstProject.mainGroup);
      project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
      for (const file of ['WidgetSchedule.swift', 'KojoriWidget.swift']) {
        project.addSourceFile(file, { target: target.uuid }, group);
      }
      // xcode's addResourceFile assumes a global Resources group; Expo has none.
      const resource = project.addFile('timetable.json', group);
      resource.uuid = project.generateUuid();
      resource.target = target.uuid;
      project.addToPbxBuildFileSection(resource);
      project.addToPbxResourcesBuildPhase(resource);
    }

    const group = Object.entries(project.hash.project.objects.PBXGroup)
      .find(([, item]) => item?.name?.replaceAll('"', '') === TARGET)[0];
    const localization = project.addFile('Localizable.xcstrings', group, { lastKnownFileType: 'text.json.xcstrings' });
    if (localization) {
      localization.uuid = project.generateUuid();
      localization.target = Object.entries(project.pbxNativeTargetSection()).find(([, item]) => item === nativeTarget)[0];
      project.addToPbxBuildFileSection(localization);
      project.addToPbxResourcesBuildPhase(localization);
    }

    const configurations = project.pbxXCBuildConfigurationSection();
    const list = project.pbxXCConfigurationList()[nativeTarget.buildConfigurationList];
    for (const item of list.buildConfigurations) {
      Object.assign(configurations[item.value].buildSettings, {
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        CURRENT_PROJECT_VERSION: config.ios.buildNumber || '1',
        MARKETING_VERSION: config.version || '1.0',
        SWIFT_VERSION: '5.0',
        IPHONEOS_DEPLOYMENT_TARGET: '17.0',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        GENERATE_INFOPLIST_FILE: 'NO',
        SWIFT_EMIT_LOC_STRINGS: 'YES',
      });
    }
    fs.writeFileSync(path.join(folder, `${TARGET}-Info.plist`), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Kojoring Time</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>NSExtension</key><dict>
<key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string>
</dict></dict></plist>`);
    // node-xcode otherwise serializes missing file metadata as literal "undefined".
    for (const file of Object.values(project.pbxFileReferenceSection())) {
      if (!file || typeof file !== 'object') continue;
      for (const key of Object.keys(file)) {
        if (file[key] === undefined || file[key] === 'undefined') delete file[key];
      }
    }
    return mod;
  });
};
