/** Standalone SideStore builds always use embedded JS, including release IPAs. */
type BuildConfig = {
  expo: {
    version?: string;
    ios: { buildNumber?: string };
    updates?: { enabled?: boolean; url?: string };
  };
};

export function configureIOSBuild<T extends BuildConfig>(config: T, releaseTag: string, refName: string, runNumber: string, attempt: string) {
  if (releaseTag) {
    if (!/^v\d{4}\.\d{1,2}\.\d{1,2}$/.test(releaseTag) || releaseTag !== refName) {
      throw new Error('Release builds must run on the matching vYYYY.M.D tag.');
    }
    if (`v${config.expo.version}` !== releaseTag) {
      throw new Error('Release tag does not match the stamped app version.');
    }
    if (!config.expo.ios.buildNumber) throw new Error('Missing stamped iOS build number.');
  }
  return {
    ...config,
    expo: {
      ...config.expo,
      updates: { ...config.expo.updates, enabled: false },
      ios: {
        ...config.expo.ios,
        buildNumber: releaseTag ? config.expo.ios.buildNumber : `1.${runNumber}.${attempt}`,
      },
    },
  };
}

if (import.meta.main) {
  const config = configureIOSBuild(
    await Bun.file('app.json').json(),
    process.env.RELEASE_TAG ?? '',
    process.env.GITHUB_REF_NAME ?? '',
    process.env.GITHUB_RUN_NUMBER ?? '0',
    process.env.GITHUB_RUN_ATTEMPT ?? '1',
  );
  await Bun.write('app.json', JSON.stringify(config, null, 2) + '\n');
}
