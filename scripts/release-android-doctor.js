#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function loadEnvFile(fileName) {
  const fullPath = path.join(root, fileName);
  if (!fs.existsSync(fullPath)) return;

  const contents = fs.readFileSync(fullPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✔ ${message}`);
}

const requiredEnv = ['GOOGLE_MAPS_API_KEY_ANDROID'];
const requiredFiles = [
  'app.json',
  'eas.json',
  'release/google-play/README.md',
  'release/google-play/store-listing.md',
  'release/google-play/data-safety.md',
  'release/google-play/content-rating.md',
  'release/google-play/app-access.md',
  'release/google-play/privacy-policy.md',
  'release/google-play/terms-of-service.md',
  'release/google-play/release-checklist.md',
  'release/google-play/setup.md',
];

let hasErrors = false;

for (const envName of requiredEnv) {
  if (process.env[envName]) {
    pass(`Environment variable ${envName} is set`);
  } else {
    fail(`Environment variable ${envName} is missing`);
    hasErrors = true;
  }
}

for (const relative of requiredFiles) {
  const fullPath = path.join(root, relative);
  if (fs.existsSync(fullPath)) {
    pass(`Found ${relative}`);
  } else {
    fail(`Missing required file ${relative}`);
    hasErrors = true;
  }
}

try {
  const appJson = readJson(path.join(root, 'app.json'));
  const expo = appJson.expo ?? {};
  if (expo.name === 'Kojori Bus') {
    pass('App name is Kojori Bus');
  } else {
    fail(`Unexpected app name: ${expo.name}`);
    hasErrors = true;
  }

  if (expo.android?.package === 'com.whekin.kojoribus') {
    pass('Android package name matches Play Console target');
  } else {
    fail(`Unexpected Android package name: ${expo.android?.package}`);
    hasErrors = true;
  }
} catch (error) {
  fail(`Unable to read app.json: ${error.message}`);
  hasErrors = true;
}

try {
  const easJson = readJson(path.join(root, 'eas.json'));
  const production = easJson.build?.production ?? {};
  if (production.autoIncrement === true) {
    pass('EAS production profile auto-increments versions');
  } else {
    fail('EAS production profile must auto-increment versions');
    hasErrors = true;
  }

  if (production.channel === 'production') {
    pass('EAS production profile uses the production channel');
  } else {
    fail(`Unexpected EAS production channel: ${production.channel}`);
    hasErrors = true;
  }

  if (production.android?.buildType === 'app-bundle') {
    pass('EAS production profile builds an Android App Bundle');
  } else {
    fail('EAS production profile must build an app bundle');
    hasErrors = true;
  }
} catch (error) {
  fail(`Unable to read eas.json: ${error.message}`);
  hasErrors = true;
}

if (hasErrors) {
  process.exit(1);
}

console.log('Release doctor passed.');
