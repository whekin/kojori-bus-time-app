#!/usr/bin/env bun
/**
 * Full release pipeline: preflight → stamp version → prebuild → build APK → commit → tag → push → GitHub release.
 * Release notes are pulled from CHANGELOG.md. During normal development,
 * add notes under "## [UNRELEASED]"; release renames that heading to the
 * concrete version tag.
 *
 * Usage:
 *   bun scripts/release.ts
 *   bun scripts/release.ts 2026.5.1
 *   bun scripts/release.ts --continue
 *   bun scripts/release.ts 2026.5.1 --continue
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

const root = resolve(import.meta.dir, '..');
const appJsonPath = resolve(root, 'app.json');
const pkgJsonPath = resolve(root, 'package.json');
const changelogPath = resolve(root, 'CHANGELOG.md');
const apkPath = resolve(root, 'android/app/build/outputs/apk/release/app-release.apk');
const statePath = resolve(root, '.release-state.json');
const toolPath = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].filter(Boolean).join(':');
const unreleasedHeading = '## [UNRELEASED]';

type Phase =
  | 'preflight'
  | 'changelog'
  | 'stamp'
  | 'prebuild'
  | 'build'
  | 'commit_push'
  | 'github_release';

type ReleaseState = {
  version: string;
  buildNumber: string;
  versionCode: number;
  tag: string;
  completed: Phase[];
};

function step(label: string) {
  console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);
}

function run(cmd: string, opts: { stdio?: 'inherit' | 'pipe'; allowFailure?: boolean } = {}) {
  try {
    return execSync(cmd, {
      cwd: root,
      env: {
        ...process.env,
        PATH: toolPath,
      },
      stdio: opts.stdio ?? 'inherit',
      encoding: opts.stdio === 'pipe' ? 'utf-8' : undefined,
    });
  } catch (err) {
    if (opts.allowFailure) return null;
    throw err;
  }
}

function saveState(state: ReleaseState) {
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

function loadState(): ReleaseState | null {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, 'utf-8')) as ReleaseState;
}

function clearState() {
  if (existsSync(statePath)) rmSync(statePath);
}

function markDone(state: ReleaseState, phase: Phase) {
  if (!state.completed.includes(phase)) {
    state.completed.push(phase);
    saveState(state);
  }
}

function isDone(state: ReleaseState, phase: Phase) {
  return state.completed.includes(phase);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findChangelogSection(heading: string): string | null {
  if (!existsSync(changelogPath)) return null;

  const content = readFileSync(changelogPath, 'utf-8');
  const headingMatch = new RegExp(`^${escapeRegExp(heading)}\\s*$`, 'm').exec(content);
  if (!headingMatch || headingMatch.index === undefined) return null;

  const afterHeading = headingMatch.index + headingMatch[0].length;
  const remaining = content.slice(afterHeading);
  const nextHeading = /^## /m.exec(remaining);
  const section =
    !nextHeading || nextHeading.index === undefined
      ? content.slice(afterHeading)
      : content.slice(afterHeading, afterHeading + nextHeading.index);

  return section.trim() || null;
}

function extractChangelog(version: string): string | null {
  return findChangelogSection(`## v${version}`);
}

function extractReleaseNotes(version: string): string | null {
  return extractChangelog(version) ?? findChangelogSection(unreleasedHeading);
}

function finalizeChangelog(version: string) {
  if (!existsSync(changelogPath) || extractChangelog(version)) return;

  const content = readFileSync(changelogPath, 'utf-8');
  const next = content.replace(
    new RegExp(`^${escapeRegExp(unreleasedHeading)}\\s*$`, 'm'),
    `## v${version}`,
  );

  if (next === content) {
    console.error(`No "${unreleasedHeading}" section found in CHANGELOG.md.`);
    process.exit(1);
  }

  writeFileSync(changelogPath, next);
}

function getReleaseArtifactsStatus(tag: string) {
  const existingTags = String(run('git tag --list', { stdio: 'pipe' }) ?? '');
  const tagExists = existingTags.split('\n').includes(tag);

  const commitForTag = String(
    run(`git rev-list -n 1 ${tag}`, { stdio: 'pipe', allowFailure: true }) ?? ''
  ).trim();

  const head = String(run('git rev-parse HEAD', { stdio: 'pipe' }) ?? '').trim();

  return {
    tagExists,
    tagPointsAtHead: !!commitForTag && commitForTag === head,
    apkExists: existsSync(apkPath),
  };
}

// ── Parse args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const continueMode = args.includes('--continue');
const versionArg = args.find(a => a !== '--continue');

const now = new Date();
const version = versionArg ?? `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

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

let state: ReleaseState = {
  version,
  buildNumber,
  versionCode,
  tag,
  completed: [],
};

if (continueMode) {
  const saved = loadState();
  if (!saved) {
    console.error('No .release-state.json found. Nothing to continue.');
    process.exit(1);
  }
  if (saved.version !== version) {
    console.error(`Saved release is ${saved.version}, but you requested ${version}.`);
    process.exit(1);
  }
  state = saved;
}

console.log(`Version:     ${version}`);
console.log(`Build:       ${buildNumber}`);
console.log(`Tag:         ${tag}`);
console.log(`Continue:    ${continueMode ? 'yes' : 'no'}`);

// ── 1. Preflight ────────────────────────────────────────────────────────────

step('1/7  Preflight');

if (!isDone(state, 'preflight')) {
  const status = String(run('git status --porcelain', { stdio: 'pipe' }) ?? '').trim();
  const { tagExists } = getReleaseArtifactsStatus(tag);

  if (!continueMode && status) {
    console.error('Uncommitted changes detected. Commit or stash first.');
    process.exit(1);
  }

  if (continueMode) {
    console.log('Continue mode: allowing existing release-related working tree changes.');
  } else {
    console.log('Clean working tree ✓');
  }

  if (tagExists) {
    console.error(`Tag ${tag} already exists.`);
    process.exit(1);
  }

  console.log(`Tag ${tag} available ✓`);
  markDone(state, 'preflight');
} else {
  console.log('Already completed ✓');
}

// ── 2. Changelog ────────────────────────────────────────────────────────────

step('2/7  Changelog');

const releaseNotes = extractReleaseNotes(version);
if (!releaseNotes) {
  console.error(`No entry for "## v${version}" or "${unreleasedHeading}" found in CHANGELOG.md.`);
  console.error(`Add release notes under "${unreleasedHeading}" before running this script.`);
  process.exit(1);
}

if (!isDone(state, 'changelog')) {
  console.log(releaseNotes);
  markDone(state, 'changelog');
} else {
  console.log('Already completed ✓');
}

// ── 3. Stamp version ────────────────────────────────────────────────────────

step('3/7  Stamp version');

if (!isDone(state, 'stamp')) {
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
  appJson.expo.version = version;
  appJson.expo.ios.buildNumber = buildNumber;
  appJson.expo.android.versionCode = versionCode;
  writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  pkgJson.version = version;
  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');

  finalizeChangelog(version);

  console.log(`app.json + package.json + CHANGELOG.md → ${version}`);
  markDone(state, 'stamp');
} else {
  console.log('Already completed ✓');
}

// ── 4. Prebuild ─────────────────────────────────────────────────────────────

step('4/7  Prebuild');

if (!isDone(state, 'prebuild')) {
  run('bunx --env-file=.env.local expo prebuild --platform android');
  console.log('Fresh native project ✓');
  markDone(state, 'prebuild');
} else {
  console.log('Already completed ✓');
}

// ── 5. Build APK ────────────────────────────────────────────────────────────

step('5/7  Build APK');

if (!isDone(state, 'build')) {
  run('cd android && ./gradlew --stop', { allowFailure: true });
  run('bun android:apk:release');

  if (!existsSync(apkPath)) {
    console.error(`\nBuild finished but APK not found at: ${apkPath}`);
    console.error(`Resume later with: bun scripts/release.ts ${version} --continue`);
    process.exit(1);
  }

  console.log('APK built ✓');
  markDone(state, 'build');
} else {
  console.log('Already completed ✓');
}

// ── 6. Commit, tag, push ────────────────────────────────────────────────────

step('6/7  Commit & push');

if (!isDone(state, 'commit_push')) {
  run('git add app.json package.json CHANGELOG.md');

  const diff = String(
    run('git diff --cached --quiet || echo changed', { stdio: 'pipe' }) ?? ''
  ).trim();

  if (diff === 'changed') {
    run(`git commit -m "Release ${tag}"`);
  } else {
    console.log('Nothing new to commit, skipping commit.');
  }

  run(`git tag -a ${tag} -m "Release ${tag}"`);
  run('git push');
  run(`git push origin ${tag}`);

  console.log(`Pushed ${tag} ✓`);
  markDone(state, 'commit_push');
} else {
  console.log('Already completed ✓');
}

// ── 7. GitHub release ───────────────────────────────────────────────────────

step('7/7  GitHub release');

if (!isDone(state, 'github_release')) {
  const apkName = `kojoring-time-${tag}.apk`;
  const renamedApkPath = resolve(root, `android/app/build/outputs/apk/release/${apkName}`);
  const notesFile = resolve(tmpdir(), `kojoring-release-${tag}.md`);
  writeFileSync(notesFile, releaseNotes);

  try {
    // Copy APK with proper name to avoid browser download issues
    run(`cp "${apkPath}" "${renamedApkPath}"`);

    run(
      `gh release create ${tag} "${renamedApkPath}" --title "Kojoring Time ${tag}" --notes-file "${notesFile}"`
    );
  } finally {
    if (existsSync(notesFile)) unlinkSync(notesFile);
    if (existsSync(renamedApkPath)) unlinkSync(renamedApkPath);
  }

  console.log(`\n🎉 Release ${tag} published!`);
  markDone(state, 'github_release');
}

clearState();
console.log('Release state cleared ✓');
