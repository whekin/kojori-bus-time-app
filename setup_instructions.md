# Google Play Setup Instructions for Kojoring Time App

## Quick Setup (15 minutes)

### Step 1: Copy Legal Templates
```bash
cp legal_docs/TOS.md legal_docs/Privacy.md .
```

### Step 2: Update AndroidManifest.xml
Add these permissions to your existing AndroidManifest.xml:
- ACCESS_FINE_LOCATION (optional, for best experience)
- ACCESS_COARSE_LOCATION (optional)
- INTERNET (already present)

Add network security config:
1. Create `android/network_security_config.xml`
2. Add to manifest: `android:networkSecurityConfig="@xml/network_security_config"`

### Step 3: Play Console Setup
1. Go to https://play.google.com/console
2. Click "Create Application"
3. Fill in:
   - App name: Kojoring Time
   - Default language: English
   - Content classification: Transportation
4. Upload screenshots (1080x1920, minimum 2, recommended 5+)
5. Add privacy policy URL

### Step 4: Required Declarations
- Complete Data Safety form
- Declare ads if using (none currently)
- Set content rating
- Add store listing description

### Step 5: Build for Release
```bash
# Clean previous builds
bun run android:clean

# Build release AAB (recommended for Play Store)
bun run android:bundle

# Or build APK for testing
bun run android:apk
```

### Step 6: Submit for Review
- Upload AAB/APK in Play Console
- Complete all declarations
- Submit for review
- Wait for approval (typically hours to days)

## Critical Compliance Notes

### ✅ Required for Approval
1. Privacy Policy URL in store listing
2. Data Safety form completed
3. Age rating declared
4. No misleading claims about accuracy
5. Location permission is OPTIONAL (must work without it)

### ⚠️ Transit App Specific
- Route 380/316 schedules may have delays
- Real-time predictions are estimates
- Offline data is baked into app
- Widget requires full rebuild on code changes

## Testing Checklist
- [ ] App works completely offline
- [ ] Both directions (Tbilisi→Kojori, Kojori→Tbilisi) work
- [ ] Location toggle works correctly
- [ ] Widget rebuild process documented
- [ ] All required permissions declared
- [ ] Privacy policy accessible

## Troubleshooting
**Rejection: Missing privacy policy**
→ Add privacy policy URL in Play Console Store Listing

**Rejection: Incomplete Data Safety**
→ Complete all questions in Data Safety form

**Rejection: Misleading claims**
→ Remove any "real-time" or "guaranteed" language from store listing
