#!/usr/bin/env bun
/**
 * Full release pipeline: preflight → changelog → bake TTC data → stamp version → prebuild → build APK → commit → tag → push → GitHub release → EAS update.
 * Release notes are pulled from CHANGELOG.md. During normal development,
 * add notes under "## [UNRELEASED]"; release renames that heading to the
 * concrete version tag.
 *
 * Usage:
 *   bun scripts/release.ts
 *   bun scripts/release.ts 2026.5.1
 *   bun scripts/release.ts --continue
 *   bun scripts/release.ts 2026.5.1 --continue
 *
 * If the requested date tag already exists, the script re-releases that version:
 * it bumps the Android build suffix, force-updates the tag, replaces the GitHub
 * release asset/notes, and publishes a fresh EAS update.
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
  | 'bake_ttc'
  | 'stamp'
  | 'prebuild'
  | 'build'
  | 'commit_push'
  | 'github_release'
  | 'eas_update';

type ReleaseState = {
  version: string;
  buildNumber: string;
  versionCode: number;
  tag: string;
  rerelease?: boolean;
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

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stripMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .trim();
}

function releaseNoteBullets(notes: string) {
  return notes
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => stripMarkdown(line.slice(2)))
    .filter(Boolean);
}

function createUpdateMessage(version: string, notes: string) {
  const bullets = releaseNoteBullets(notes);
  const first = bullets[0];
  if (!first) return `Kojoring Time v${version}`;

  const suffix = bullets.length > 1 ? ` (+${bullets.length - 1} more)` : '';
  return `Kojoring Time v${version}: ${first}${suffix}`;
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
  return findChangelogSection(unreleasedHeading) ?? extractChangelog(version);
}

function finalizeChangelog(version: string) {
  if (!existsSync(changelogPath)) return;

  const content = readFileSync(changelogPath, 'utf-8');
  const existingReleaseNotes = extractChangelog(version);
  const unreleasedNotes = findChangelogSection(unreleasedHeading);

  if (existingReleaseNotes && unreleasedNotes) {
    const withoutUnreleased = removeChangelogSection(content, unreleasedHeading);
    const versionHeading = `## v${version}`;
    const headingMatch = new RegExp(`^${escapeRegExp(versionHeading)}\\s*$`, 'm').exec(withoutUnreleased);
    if (!headingMatch || headingMatch.index === undefined) return;

    const insertAt = headingMatch.index + headingMatch[0].length;
    const next = `${withoutUnreleased.slice(0, insertAt)}\n${unreleasedNotes}\n\n${withoutUnreleased.slice(insertAt).trimStart()}`;
    writeFileSync(changelogPath, next);
    return;
  }

  if (existingReleaseNotes) return;

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

function removeChangelogSection(content: string, heading: string) {
  const headingMatch = new RegExp(`^${escapeRegExp(heading)}\\s*$`, 'm').exec(content);
  if (!headingMatch || headingMatch.index === undefined) return content;

  const start = headingMatch.index;
  const afterHeading = headingMatch.index + headingMatch[0].length;
  const remaining = content.slice(afterHeading);
  const nextHeading = /^## /m.exec(remaining);
  const end =
    !nextHeading || nextHeading.index === undefined
      ? content.length
      : afterHeading + nextHeading.index;

  return `${content.slice(0, start)}${content.slice(end).replace(/^\n+/, '\n')}`;
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

function checkRuntimeVersion(baseRef: string) {
  run(`node scripts/check-runtime-version.js --base=${shellQuote(baseRef)}`);
}

function getRuntimeCheckBase() {
  return String(
    run('git describe --tags --match "v*" --abbrev=0 || git rev-parse HEAD', { stdio: 'pipe' }) ?? ''
  ).trim();
}

function getTagExists(tag: string) {
  const existingTags = String(run(`git tag --list ${shellQuote(tag)}`, { stdio: 'pipe' }) ?? '').trim();
  return existingTags.split('\n').includes(tag);
}

function createBuildMetadata(version: string, rerelease: boolean) {
  const [y, m, d] = version.split('.').map(Number);
  const base = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  let suffix = 0;

  if (rerelease && existsSync(appJsonPath)) {
    const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
    const currentVersionCode = Number(appJson.expo?.android?.versionCode);
    const currentVersion = appJson.expo?.version;
    if (currentVersion === version && Number.isInteger(currentVersionCode)) {
      const currentBuild = String(currentVersionCode);
      if (currentBuild.startsWith(base)) {
        suffix = Number(currentBuild.slice(base.length) || '0') + 1;
      }
    }
  }

  if (suffix > 99) {
    console.error(`Build suffix overflow for ${version}. Expected suffix <= 99, got ${suffix}.`);
    process.exit(1);
  }

  const buildNumber = `${base}${String(suffix).padStart(2, '0')}`;
  return {
    buildNumber,
    versionCode: Number(buildNumber),
  };
}

// ── Parse args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const continueMode = args.includes('--continue');
const versionArg = args.find(a => a !== '--continue');

const now = new Date();
let version = versionArg ?? `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

const parts = version.split('.');
if (parts.length !== 3 || parts.some(p => isNaN(Number(p)))) {
  console.error(`Invalid version format: ${version}. Expected YYYY.M.D`);
  process.exit(1);
}

let tag = `v${version}`;
const initialRerelease = getTagExists(tag);
let { buildNumber, versionCode } = createBuildMetadata(version, initialRerelease);

let state: ReleaseState = {
  version,
  buildNumber,
  versionCode,
  tag,
  rerelease: initialRerelease,
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
  version = state.version;
  buildNumber = state.buildNumber;
  versionCode = state.versionCode;
  tag = state.tag;
}

console.log(`Version:     ${version}`);
console.log(`Build:       ${buildNumber}`);
console.log(`Tag:         ${tag}`);
console.log(`Mode:        ${state.rerelease ? 're-release existing tag' : 'new release'}`);
console.log(`Continue:    ${continueMode ? 'yes' : 'no'}`);

const runtimeCheckBase = continueMode ? null : getRuntimeCheckBase();

// ── 1. Preflight ────────────────────────────────────────────────────────────

step('1/9  Preflight');

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

  if (tagExists && !state.rerelease) {
    console.error(`Tag ${tag} already exists.`);
    process.exit(1);
  }

  if (state.rerelease) {
    console.log(`Tag ${tag} exists; re-release mode will replace the tag and GitHub asset.`);
  } else {
    console.log(`Tag ${tag} available ✓`);
  }
  if (runtimeCheckBase) checkRuntimeVersion(runtimeCheckBase);
  markDone(state, 'preflight');
} else {
  console.log('Already completed ✓');
}

// ── 2. Changelog ────────────────────────────────────────────────────────────

step('2/9  Changelog');

let releaseNotes = extractReleaseNotes(version);
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

// ── 3. Bake TTC data ────────────────────────────────────────────────────────

step('3/9  Bake TTC data');

if (!isDone(state, 'bake_ttc')) {
  run('bun run bake:ttc');
  console.log('Fresh TTC data baked ✓');
  markDone(state, 'bake_ttc');
} else {
  console.log('Already completed ✓');
}

// ── 4. Stamp version ────────────────────────────────────────────────────────

step('4/9  Stamp version');

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
  releaseNotes = extractChangelog(version) ?? releaseNotes;

  console.log(`app.json + package.json + CHANGELOG.md → ${version}`);
  markDone(state, 'stamp');
} else {
  console.log('Already completed ✓');
}

// ── 5. Prebuild ─────────────────────────────────────────────────────────────

step('5/9  Prebuild');

if (!isDone(state, 'prebuild')) {
  run('NODE_ENV=production EXPO_UPDATE_CHANNEL=production bunx --env-file=.env.local expo prebuild --platform android');
  console.log('Fresh native project ✓');
  markDone(state, 'prebuild');
} else {
  console.log('Already completed ✓');
}

// ── 6. Build APK ────────────────────────────────────────────────────────────

step('6/9  Build APK');

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

// ── 7. Commit, tag, push ────────────────────────────────────────────────────

step('7/9  Commit & push');

if (!isDone(state, 'commit_push')) {
  run('git add app.json package.json CHANGELOG.md assets/ttc-baked.ts');

  const diff = String(
    run('git diff --cached --quiet || echo changed', { stdio: 'pipe' }) ?? ''
  ).trim();

  if (diff === 'changed') {
    run(`git commit -m "Release ${tag}"`);
  } else {
    console.log('Nothing new to commit, skipping commit.');
  }

  run(`git tag ${state.rerelease ? '-fa' : '-a'} ${tag} -m "Release ${tag}"`);
  run('git push');
  run(`git push ${state.rerelease ? '--force ' : ''}origin ${tag}`);

  console.log(`Pushed ${tag}${state.rerelease ? ' replacement' : ''} ✓`);
  markDone(state, 'commit_push');
} else {
  console.log('Already completed ✓');
}

// ── 8. GitHub release ───────────────────────────────────────────────────────

step('8/9  GitHub release');

if (!isDone(state, 'github_release')) {
  const apkName = `kojoring-time-${tag}.apk`;
  const renamedApkPath = resolve(root, `android/app/build/outputs/apk/release/${apkName}`);
  const notesFile = resolve(tmpdir(), `kojoring-release-${tag}.md`);
  writeFileSync(notesFile, releaseNotes);

  try {
    // Copy APK with proper name to avoid browser download issues
    run(`cp "${apkPath}" "${renamedApkPath}"`);

    if (state.rerelease) {
      const releaseExists = run(`gh release view ${tag}`, { stdio: 'pipe', allowFailure: true }) !== null;
      if (!releaseExists) {
        run(
          `gh release create ${tag} "${renamedApkPath}" --title "Kojoring Time ${tag}" --notes-file "${notesFile}"`
        );
      } else {
        run(`gh release edit ${tag} --title "Kojoring Time ${tag}" --notes-file "${notesFile}"`);
        run(`gh release upload ${tag} "${renamedApkPath}" --clobber`);
      }
    } else {
      run(
        `gh release create ${tag} "${renamedApkPath}" --title "Kojoring Time ${tag}" --notes-file "${notesFile}"`
      );
    }
  } finally {
    if (existsSync(notesFile)) unlinkSync(notesFile);
    if (existsSync(renamedApkPath)) unlinkSync(renamedApkPath);
  }

  console.log(`\n🎉 Release ${tag} ${state.rerelease ? 're-published' : 'published'}!`);
  markDone(state, 'github_release');
}

// ── 9. EAS update ──────────────────────────────────────────────────────────

step('9/9  EAS update');

if (!isDone(state, 'eas_update')) {
  const updateMessage = createUpdateMessage(version, releaseNotes);
  run(
    `NODE_ENV=production bunx eas update --channel production --environment production --message ${shellQuote(updateMessage)} --non-interactive`
  );

  console.log(`EAS production update published: ${updateMessage}`);
  markDone(state, 'eas_update');
} else {
  console.log('Already completed ✓');
}

clearState();
console.log('Release state cleared ✓');
