#!/usr/bin/env bun
/**
 * Stamp date-based version into app.json + package.json, commit, and tag.
 *
 * Usage:
 *   bun scripts/release-version.ts          # uses today's date
 *   bun scripts/release-version.ts 2026.5.1 # explicit version
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const root = resolve(import.meta.dir, '..');
const appJsonPath = resolve(root, 'app.json');
const pkgJsonPath = resolve(root, 'package.json');

// Parse version
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

// Check for uncommitted changes
const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
if (status) {
  console.error('\nUncommitted changes detected. Commit or stash first.');
  process.exit(1);
}

// Check tag doesn't already exist
const existingTags = execSync('git tag --list', { cwd: root, encoding: 'utf-8' });
if (existingTags.split('\n').includes(tag)) {
  console.error(`\nTag ${tag} already exists.`);
  process.exit(1);
}

// Update app.json
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
appJson.expo.version = version;
appJson.expo.ios.buildNumber = buildNumber;
appJson.expo.android.versionCode = versionCode;
writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

// Update package.json
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
pkgJson.version = version;
writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');

// Commit and tag
execSync(`git add app.json package.json`, { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "Release ${tag}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag -a ${tag} -m "Release ${tag}"`, { cwd: root, stdio: 'inherit' });

console.log(`\nDone! Push with: git push && git push origin ${tag}`);
