#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SOURCE_SVG = path.join(__dirname, '../assets/images/icon-master.svg');
const OUTPUT_DIR = path.join(__dirname, '../assets/images');

const icons = [
  // Main app icon (iOS/Android)
  { name: 'icon.png', size: 1024 },
  
  // Android adaptive icon
  { name: 'android-icon-foreground.png', size: 1024 },
  { name: 'android-icon-monochrome.png', size: 1024 },
  
  // Splash screen icon
  { name: 'splash-icon.png', size: 512 },
  
  // Favicon
  { name: 'favicon.png', size: 48 },
];

console.log('🎨 Generating icons from icon-master.svg...\n');

icons.forEach(({ name, size }) => {
  const output = path.join(OUTPUT_DIR, name);
  console.log(`Generating ${name} (${size}x${size})...`);
  
  try {
    execSync(
      `bunx sharp-cli -i "${SOURCE_SVG}" -o "${output}" resize ${size} ${size}`,
      { stdio: 'inherit' }
    );
  } catch (error) {
    console.error(`Failed to generate ${name}:`, error.message);
    process.exit(1);
  }
});

// Generate android-icon-background.png (solid color background)
console.log('\nGenerating android-icon-background.png (solid color)...');
const bgOutput = path.join(OUTPUT_DIR, 'android-icon-background.png');
try {
  execSync(
    `bunx sharp-cli -i "${SOURCE_SVG}" -o "${bgOutput}" resize 1024 1024 --background "#09090B"`,
    { stdio: 'inherit' }
  );
} catch (error) {
  console.error('Failed to generate background:', error.message);
  process.exit(1);
}

console.log('\n✅ All icons generated successfully!');
