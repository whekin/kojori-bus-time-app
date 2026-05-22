#!/usr/bin/env node

const { execFileSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baseRefArg = process.argv.find(arg => arg.startsWith('--base='));

const nativeRuntimePatterns = [
  /^app\.config\.ts$/,
  /^bun\.lock$/,
  /^eas\.json$/,
  /^metro\.config\.js$/,
  /^package\.json$/,
  /^modules\//,
  /^android\//,
  /^ios\//,
  /^plugins\//,
  /^assets\/images\/(?:icon|android-icon|splash)/,
];

const appJsonNativeKeys = new Set([
  'orientation',
  'icon',
  'scheme',
  'userInterfaceStyle',
  'runtimeVersion',
  'updates',
  'ios',
  'android',
  'plugins',
  'experiments',
]);

function runGit(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function latestReleaseTag() {
  try {
    return runGit(['describe', '--tags', '--match', 'v*', '--abbrev=0']);
  } catch {
    return 'HEAD';
  }
}

const baseRef = baseRefArg ? baseRefArg.slice('--base='.length) : latestReleaseTag();

function loadRuntimeVersion(ref) {
  let content;
  if (ref === 'WORKTREE') {
    content = readFileSync(path.join(root, 'app.json'), 'utf8');
  } else {
    try {
      content = runGit(['show', `${ref}:app.json`]);
    } catch {
      return null;
    }
  }

  const appJson = JSON.parse(content);
  const runtimeVersion = appJson.expo?.runtimeVersion;
  if (typeof runtimeVersion === 'string') return runtimeVersion;
  if (runtimeVersion?.policy) return `policy:${runtimeVersion.policy}`;
  return null;
}

function changedFilesSince(ref) {
  const diffOutput = runGit(['diff', '--name-only', ref, '--']);
  return diffOutput ? diffOutput.split('\n').filter(Boolean) : [];
}

function appJsonChangedNativeConfig(ref) {
  const previousContent = runGit(['show', `${ref}:app.json`]);
  const currentContent = readFileSync(path.join(root, 'app.json'), 'utf8');
  const previousExpo = JSON.parse(previousContent).expo ?? {};
  const currentExpo = JSON.parse(currentContent).expo ?? {};

  for (const key of appJsonNativeKeys) {
    if (JSON.stringify(previousExpo[key]) !== JSON.stringify(currentExpo[key])) {
      return true;
    }
  }

  return false;
}

function main() {
  if (!existsSync(path.join(root, '.git'))) {
    return;
  }

  const changedFiles = changedFilesSince(baseRef);
  const nativeRuntimeFiles = changedFiles.filter(file => {
    if (file === 'app.json') return appJsonChangedNativeConfig(baseRef);
    return nativeRuntimePatterns.some(pattern => pattern.test(file));
  });

  if (nativeRuntimeFiles.length === 0) {
    console.log(`Runtime guard passed: no native runtime files changed since ${baseRef}.`);
    return;
  }

  const previousRuntime = loadRuntimeVersion(baseRef);
  const currentRuntime = loadRuntimeVersion('WORKTREE');

  if (previousRuntime && currentRuntime && previousRuntime !== currentRuntime) {
    console.log(`Runtime guard passed: ${previousRuntime} -> ${currentRuntime}.`);
    return;
  }

  console.error(`Runtime guard failed: native/runtime files changed since ${baseRef}, but app.json runtimeVersion did not change.`);
  console.error('');
  console.error('Changed native/runtime files:');
  for (const file of nativeRuntimeFiles) {
    console.error(`- ${file}`);
  }
  console.error('');
  console.error(`Current runtimeVersion: ${currentRuntime ?? 'missing'}`);
  console.error('Bump app.json expo.runtimeVersion when these changes require a new native runtime.');
  console.error('If the changes are definitely JS-only safe, pass a narrower --base or commit them separately.');
  process.exit(1);
}

main();
