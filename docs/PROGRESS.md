# Progress

## Phase 1: Foundations (done)

### Done

- **Monorepo** with npm workspaces: `app/`, `shared/`, `simulator/` (`docs/` holds the docs). JavaScript only, no TypeScript.
- **Root tooling:** ESLint 9 flat config (with React and hooks rules), Prettier, Jest (with a Babel transform so the app's ES-module logic can be tested without React Native).
  Scripts: `npm test`, `npm run lint`, `npm run format`, `npm run app`, `npm run sim`.
- **`/shared` PM5 protocol package** (pure JS, CommonJS, no platform dependencies):
  - `pm5/uuids.js`: 128-bit UUID builder, named constants, short-ID helpers.
  - `pm5/enums.js`: every Appendix A enum with labels, plus `ergFamily()`.
  - `pm5/layouts.js`: byte layouts for 0x31/32/33/35/36 and their multiplexed variants. One table drives both encode and decode, so they can't drift apart.
  - `pm5/decode.js`: all decoders plus `decodeCharacteristic` / `decodeDeviceInfo` / `decodeSampleRate`. They never throw, return SI units and derived fields, and keep the raw hex.
  - `pm5/encode.js`: the exact inverse, which clamps out-of-range values instead of wrapping them.
  - `pm5/csafe.js`: framing, byte stuffing, checksum, command/response packing.
  - `pm5/bytes.js`: little-endian helpers, hex, pure-JS base64 (for `react-native-ble-plx`).
  - `physics.js`: Concept2 watts/pace/calories formulas (from the PDF, Appendix B). `format.js`: pace/time/distance formatting and parsing. `constants.js`: `APP_NAME` and the simulator name.
- **Tests:** 101 passing. They cover round-trips for every characteristic and multiplexed ID, edge values (0, 24-bit max, speed 0, HR 255, clamping), short/garbage packets, the 15- and 18-byte 0x0036 variants, CSAFE framing, physics, formatting, i18n key parity, and a WCAG contrast check of the palette.
- **App (Expo SDK 58, RN 0.88, dev client):**
  - `app.config.js`: landscape, Android permissions (`BLUETOOTH_SCAN` with `neverForLocation`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` for Android ≤ 11), BLE plugin, orientation lock.
  - `metro.config.js`: `watchFolders` + `nodeModulesPaths` for `/shared`.
  - Theme tokens (`src/theme/tokens.js`) and UI kit (`src/components/ui/`): Text, Button, Card, GlassPanel, Pill, StatTile, Gauge, Chip, SegmentedControl, Modal, Screen, Icon (original SVG icons), PressableScale.
  - i18n (EN/FR/AR) with `useT()`; menus flip to RTL for Arabic and the race HUD stays fixed. Settings store (zustand, persisted).
  - expo-router skeleton: onboarding → connect → home → race/map → race/workout → race/ready → race/run → race/results, plus history, settings and diagnostics. Home has its real layout. The other routes are labeled stubs that later phases replace.
- **Verified:** `expo export --platform android` bundles the whole app, `/shared` included.

### Decisions

- `/shared` is CommonJS so the Node simulator and Metro can both use it with no build step.
- The HUD glass panel opacity was raised from 0.78 to **0.85**: the contrast test showed orange stroke-rate text falling to 4.2:1 over a bright sky.
- `GlassPanel` uses real blur on iOS only (or when you pass `blur` on Android), because Android blur would hurt the 60 fps budget.
- Icons are a small, original SVG set, not an icon-font dependency.
- `@react-three/drei` is not installed yet. Phase 5 will add it only if a native-safe helper is really needed.

### Known issues

- `react` is pinned to 19.3.0 with root `overrides` (Expo SDK 58 requires it; `@react-three/fiber` was pulling in 19.3.1).
- Not yet run on a device or emulator: there is no dev-client build yet. Phase 3 needs one (`npx expo run:android`).
- No app icon or splash image yet (phase 7).

## Phase 2: Simulator (not started)

## Phase 3: Data layer (not started)

## Phase 4: Race engine (not started)

## Phase 5: 3D (not started)

## Phase 6: Screens and HUD (not started)

## Phase 7: Hardening and delivery (not started)
