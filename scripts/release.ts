#!/usr/bin/env bun
/**
 * Full release pipeline: preflight → stamp version → prebuild → build APK → commit → tag → push → GitHub release.
 * Release notes are pulled from CHANGELOG.md (section matching the version tag).
 *
 * Usage:
 *   bun scripts/release.ts          # uses today's date
 *   bun scripts/release.ts 2026.5.1 # explicit version
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { tmpdir } from 'os';

const root = resolve(import.meta.dir, '..');
const appJsonPath = resolve(root, 'app.json');
const pkgJsonPath = resolve(root, 'package.json');
const changelogPath = resolve(root, 'CHANGELOG.md');
const apkPath = resolve(root, 'android/app/build/outputs/apk/release/app-release.apk');

function step(label: string) {
  console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);
}

// ── Parse version ────────────────────────────────────────────────────────────

const arg = process.argv[2];
const now = new Date();
const version = arg ?? `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

const parts = version.split('.');
if (parts.length !== 3 || parts.some(p => isNaN(Number(p)))) {
  console.error(`Invalid version format: ${version}. Expected YYYY.M.D`);
  process.exit(1);
}

const [y, m, d] = parts.map(Number);
const buildSuffix = '00'; // bump manually for same-day re-releases
const buildNumber = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}${buildSuffix}`;
const versionCode = Number(buildNumber);
const tag = `v${version}`;

console.log(`Version:     ${version}`);
console.log(`Build:       ${buildNumber}`);
console.log(`Tag:         ${tag}`);

// ── 1. Preflight checks ─────────────────────────────────────────────────────

step('1/7  Preflight');

const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
if (status) {
  console.error('Uncommitted changes detected. Commit or stash first.');
  process.exit(1);
}

const existingTags = execSync('git tag --list', { cwd: root, encoding: 'utf-8' });
if (existingTags.split('\n').includes(tag)) {
  console.error(`Tag ${tag} already exists.`);
  process.exit(1);
}

console.log('Clean working tree ✓');
console.log(`Tag ${tag} available ✓`);

// ── 2. Extract release notes from CHANGELOG.md ──────────────────────────────

step('2/7  Changelog');

function extractChangelog(version: string): string | null {
  if (!existsSync(changelogPath)) return null;

  const content = readFileSync(changelogPath, 'utf-8');
  const heading = `## v${version}`;
  const start = content.indexOf(heading);
  if (start === -1) return null;

  const afterHeading = start + heading.length;
  const nextSection = content.indexOf('\n## ', afterHeading);
  const section = nextSection === -1
    ? content.slice(afterHeading)
    : content.slice(afterHeading, nextSection);

  return section.trim() || null;
}

const releaseNotes = extractChangelog(version);
if (!releaseNotes) {
  console.error(`No entry for "## v${version}" found in CHANGELOG.md.`);
  console.error('Add release notes before running this script.');
  process.exit(1);
}

console.log(releaseNotes);

// ── 3. Stamp version ────────────────────────────────────────────────────────

step('3/7  Stamp version');

const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
appJson.expo.version = version;
appJson.expo.ios.buildNumber = buildNumber;
appJson.expo.android.versionCode = versionCode;
writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
pkgJson.version = version;
writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');

console.log(`app.json + package.json → ${version}`);

// ── 4. Prebuild ────────────────────────────────────────────────────────────

step('4/7  Prebuild');

execSync('bunx expo prebuild --clean', { cwd: root, stdio: 'inherit' });

console.log('Fresh native project ✓');

// ── 5. Build APK ────────────────────────────────────────────────────────────

step('5/7  Build APK');

execSync('bun android:apk:release', { cwd: root, stdio: 'inherit' });

if (!existsSync(apkPath)) {
  console.error(`\nBuild finished but APK not found at: ${apkPath}`);
  process.exit(1);
}

console.log('APK built ✓');

// ── 5. Commit, tag, push ────────────────────────────────────────────────────

step('6/7  Commit & push');

execSync(`git add app.json package.json`, { cwd: root, stdio: 'inherit' });
const diff = execSync('git diff --cached --quiet || echo changed', { cwd: root, encoding: 'utf-8' }).trim();
if (diff === 'changed') {
  execSync(`git commit -m "Release ${tag}"`, { cwd: root, stdio: 'inherit' });
} else {
  console.log('Version already up to date, skipping commit.');
}
execSync(`git tag -a ${tag} -m "Release ${tag}"`, { cwd: root, stdio: 'inherit' });
execSync('git push', { cwd: root, stdio: 'inherit' });
execSync(`git push origin ${tag}`, { cwd: root, stdio: 'inherit' });

console.log(`Pushed ${tag} ✓`);

// ── 6. GitHub release ───────────────────────────────────────────────────────

step('7/7  GitHub release');

const apkName = `kojoring-time-${tag}.apk`;
const notesFile = resolve(tmpdir(), `kojoring-release-${tag}.md`);
writeFileSync(notesFile, releaseNotes);

execSync(
  `gh release create ${tag} "${apkPath}#${apkName}" --title "Kojoring Time ${tag}" --notes-file "${notesFile}"`,
  { cwd: root, stdio: 'inherit' },
);
unlinkSync(notesFile);

console.log(`\n🎉 Release ${tag} published!`);
