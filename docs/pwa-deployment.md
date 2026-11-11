# PWA deployment

Target: `https://gzaap.whekin.dev`.

Use a separate `gzaap-pwa` application in the existing Gzaap / production
Coolify project. The domain already resolves to the Coolify host. The backend
application and database do not need changes.

## Application settings

- Repository: `whekin/kojori-bus-time-app`
- Deployment branch: `codex/pwa`
- Build pack: Dockerfile, repository root, `/Dockerfile`
- Internal port: `8081`; do not publish a host port
- Domain: `https://gzaap.whekin.dev`
- Health check: `GET /`, expected status `200`
- Enable proxy compression and HTTPS
- Deploy manually; no automatic webhook or deployment credentials are needed

The image builds the Expo client and server together, generates the versioned
service worker, and serves both from Bun as a non-root user. Local environment
files and native build artifacts are excluded from the build context. Native
Google Maps keys are not needed by the web map. Experimental backend feature
flags stay at their defaults.

The optional `TTC_API_KEY` runtime variable overrides the existing TTC key in
the same-origin `/ttc` endpoint. No database credentials are needed.

## Verification

```bash
docker build -t gzaap-pwa .
docker run --rm -p 8097:8081 gzaap-pwa
```

Before deployment, run the source checks from AGENTS.md. After deployment,
check all four app pages (`/`, `/explore`, `/timetable`, `/settings`), manifest,
icons, `/sw.js`, and a permitted `/ttc` request over verified HTTPS. Ensure the
service worker installs successfully and an offline reload displays cached
timetables. Unsupported proxy paths must return `400`.

Deploy client and server atomically. Roll back by redeploying the previous
source commit in Coolify; keep its image until the new deployment is verified.
An installed PWA activates a downloaded update after all its windows close.

On a real iPhone, open the URL in Safari and use Share → Add to Home Screen.
Verify standalone launch, saved trips, and airplane-mode reopening after a
successful online visit.

Check the `gzaap-pwa` application in Coolify for the current deployment status
and deployed commit.
