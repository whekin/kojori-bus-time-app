/** Local Android beta APK with embedded JS; never publishes an OTA update. */
import { resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
const root = resolve(import.meta.dir, '..');
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');
const original = await Bun.file(manifestPath).text();
const marker = '<meta-data android:name="expo.modules.updates.ENABLED" android:value="true"/>';
if (!original.includes(marker)) throw new Error('Expected generated Android manifest with updates enabled; inspect before building.');
const args = process.argv.slice(2);
const etaPreview = args.includes('--eta-preview');
if (args.some(arg => arg.startsWith('--') && arg !== '--eta-preview')) throw new Error('Unknown preview option');
const paths = args.filter(arg => !arg.startsWith('--'));
if (paths.length > 1) throw new Error('Expected one APK output path');
const etaPatterns = ['1:R97505/0:01','1:R97505/1:01','1:R98445/0:01','1:R98445/1:01'];
const output = resolve(paths[0] ?? (etaPreview ? '/private/tmp/gzaap-eta-pilot-arm64.apk' : '/private/tmp/gzaap-observations-preview-arm64.apk'));
let child: ReturnType<typeof Bun.spawn> | undefined;
const interrupt = () => child?.kill('SIGTERM');
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
 await Bun.write(manifestPath, original.replace(marker, marker.replace('"true"', '"false"')));
 // Gradle does not track EXPO_PUBLIC flag changes as JS bundle inputs.
 await rm(resolve(root, 'android/app/build/generated/assets/react/release'), {recursive:true,force:true});
 child = Bun.spawn(['./gradlew', ':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a'], {
  cwd: resolve(root, 'android'), stdout: 'inherit', stderr: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_GZAAP_ETA_PREVIEW: String(etaPreview), EXPO_PUBLIC_GZAAP_ETA_PATTERNS: etaPreview ? etaPatterns.join(',') : '', EXPO_PUBLIC_GZAAP_API_URL: 'https://gzaap-api.whekin.dev', GZAAP_WEB_BASE_URL: '', EXPO_PUBLIC_GZAAP_ETA_DEMO: 'false', EXPO_PUBLIC_GZAAP_OBSERVATIONS: 'true', EXPO_PUBLIC_GZAAP_ARRIVALS: 'ttc', EXPO_PUBLIC_GZAAP_PASSED_EARLY: 'true', EXPO_PUBLIC_GZAAP_PASSED_PATTERNS: '1:R97505/0:01,1:R97505/1:01,1:R98445/0:01,1:R98445/1:01', EXPO_PUBLIC_GZAAP_PASSED_DEMO: 'false', NODE_ENV: 'production' },
 });
 if (await child.exited !== 0) throw new Error('Android preview build failed');
 await mkdir(resolve(output, '..'), { recursive: true });
 await Bun.write(output, Bun.file(resolve(root, 'android/app/build/outputs/apk/release/app-release.apk')));
 const dirty=await new Response(Bun.spawn(['git','status','--porcelain'],{cwd:root,stdout:'pipe'}).stdout).text();
 const revision=await new Response(Bun.spawn(['git','rev-parse','HEAD'],{cwd:root,stdout:'pipe'}).stdout).text();
 const hash=new Bun.CryptoHasher('sha256');hash.update(await Bun.file(output).arrayBuffer());
 await Bun.write(output+'.json',JSON.stringify({builtAt:new Date().toISOString(),revision:revision.trim(),workingTreeMayContainChanges:Boolean(dirty.trim()),sha256:hash.digest('hex'),architecture:'arm64-v8a',otaEnabled:false,flags:{observations:true,passedEarly:true,arrivals:'ttc',eta:etaPreview?'pilot':'off',demo:false},etaPatterns:etaPreview?etaPatterns:[],passedEarlyPatterns:['1:R97505/0:01','1:R97505/1:01','1:R98445/0:01','1:R98445/1:01']},null,2)+'\n');
 console.log(`Observations preview (OTA disabled): ${output}`);
} finally {
 await Bun.write(manifestPath, original);
 process.removeListener('SIGINT', interrupt);
 process.removeListener('SIGTERM', interrupt);
}
