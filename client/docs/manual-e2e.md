# Manual E2E Release Checklist

Use this checklist before publishing or sharing an APK build. It is intentionally manual because it touches real services, real auth, and native device features.

## Scope

This test confirms that the built APK:

- starts without crashing,
- has EAS environment variables embedded,
- can load backend data,
- can navigate through the main screens,
- can send one real assistant question,
- can open answer sources/PDFs when available,
- handles auth/config errors with a visible modal.

## Prerequisites

- EAS `preview` environment contains:
    - `EXPO_PUBLIC_AUTH_URL`
    - `EXPO_PUBLIC_AUTH_TOKEN`
    - `EXPO_PUBLIC_OPENAI_API_KEY`
- `client/eas.json` preview profile uses:
    - `environment: "preview"`
    - `android.buildType: "apk"`
- Backend/staging API is reachable.
- Test Android device or emulator is available.

## Build

From `client/`:

```bash
npm.cmd run lint
npm.cmd test -- --runInBand
eas build -p android --profile preview
```

Install the APK from the EAS build page on a device or emulator.

## Test Data

Use one short question to keep external service cost low:

```text
Jak sprawdzić poziom oleju?
```

## Checklist

Record the build URL or APK name:

```text
Build:
Tester:
Device:
Date:
```

### 1. Launch

- [ ] App installs successfully.
- [ ] App opens without a crash.
- [ ] Home screen appears.
- [ ] No `Missing EXPO_PUBLIC_AUTH_TOKEN` or config error modal appears.

Expected: Home screen shows the vehicle selection experience.

### 2. Home Data

- [ ] Vehicle/brand/type data loads.
- [ ] Brand filters are visible.
- [ ] Type filters are visible.
- [ ] Tapping `HISTORIA CZATÓW` opens the history screen.
- [ ] Tapping `WSTECZ` returns to home.

Expected: Backend data is visible and navigation works.

### 3. Chat Entry

- [ ] Select a vehicle.
- [ ] Chat screen opens.
- [ ] Header shows the selected vehicle name.
- [ ] `WSZYSTKIE PLIKI` opens the source/files panel.
- [ ] Closing the panel returns to chat.

Expected: Chat screen is usable and attachments panel does not crash.

### 4. Assistant Question

- [ ] Open text input.
- [ ] Send: `Jak sprawdzić poziom oleju?`
- [ ] User message appears.
- [ ] Assistant loading state appears.
- [ ] Assistant response appears.
- [ ] No auth/config/service error modal appears.

Expected: Real backend + assistant flow completes.

### 5. Source/PDF

If the assistant response includes a source link:

- [ ] Tap `POKAŻ ŹRÓDŁO ODPOWIEDZI`.
- [ ] Source panel opens.
- [ ] PDF/source loads.
- [ ] Closing the panel returns to chat.

Expected: Source preview works or a clear service error modal appears.

### 6. Voice Controls Smoke

Do not run a long voice test unless needed.

- [ ] Tap microphone once.
- [ ] Permission prompt is understandable if shown.
- [ ] Denying permission does not crash the app.
- [ ] Granting permission starts listening state.
- [ ] Stopping returns the UI to idle/processing without crash.

Expected: Native microphone path does not crash.

### 7. Error Visibility

Only run this on a separate build or staging configuration if you intentionally test bad auth.

- [ ] Build with invalid `EXPO_PUBLIC_AUTH_TOKEN`.
- [ ] App shows an auth/service modal instead of silently failing.
- [ ] Modal text identifies the failing feature.

Expected: Users see a clear error state.

## Result

```text
PASS / FAIL:
Notes:
Blocking issues:
Follow-up tickets:
```

## When To Run

Run this checklist:

- before sharing an APK externally,
- before a release tag,
- after changes to auth/env/API/chat/audio/PDF/native modules,
- after EAS/build configuration changes.

Do not run the full checklist on every PR. PRs should rely on `npm test` and `npm run lint`; this checklist is a release/manual confidence pass.
