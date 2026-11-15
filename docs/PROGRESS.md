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

## Phase 2: Simulator (done; real-radio test still pending)

### Done

- **Shared rower model** (`shared/sim/rowerModel.js`): a deterministic (seeded) model of a person rowing.
  - Stroke cycle is 35% drive, 5% dwell, 60% recovery. Boat speed surges in the drive, and the mean pace matches the target with a slow ±2 s human drift.
  - Flywheel spins down when the rower stops; stroke state follows the PM5 enum.
  - Also models stroke data (drive length/time, recovery, forces, work), watts and calories from the Concept2 formulas, heart rate that climbs with effort, 500 m splits, and PM5 reset.
  - It lives in `/shared` so the phase 3 in-app mock uses exactly the same data.
- **Shared scenarios** (`shared/sim/scenarios.js`): steady, sprint, fatigue, intervals, stop-go, reset-mid-race, disconnect, dropouts, noisy (1% bad lengths), slow-rate (locked 1 s, refuses app writes), manual. Each returns transport actions (stall / disconnect / malformed / sample rate) for whichever host runs it.
- **Shared packet builder** (`shared/sim/packets.js`) and **log format** (`shared/log/format.js`). `dir` = `notify`/`read`/`write`, so app and simulator logs mean the same thing.
- **`/simulator`:**
  - `core.js`: transport-agnostic engine. It honors the sample rate, sends each characteristic individually or falls back to multiplexed `0x0080`, and handles stall, malformed packets, reset and forced disconnect.
  - `peripheral.js`: bleno GATT for Device Info 0x0010–0x0016, Control 0x0021/0x0022, Rowing 0x0031–0x0036 + 0x0080. Tracks subscriptions, re-advertises after a disconnect, and sets the GAP name to `PM5 <serial>`.
  - `csafeHandler.js`: valid response frames (GETSTATUS, GETVERSION, GETSERIAL, status-only for everything else, BAD on a broken frame).
  - `replay.js`: re-broadcasts a client or simulator `.jsonl` with its original timing (×1/×2/×4, loop). It starts when the app subscribes and re-encodes as multiplexed if needed.
  - `logger.js` writes `simulator/logs/<ts>.jsonl`. `terminal.js` has every key from the brief plus a live status line. `cli.js` handles every flag from the brief, plus `--rate`, `--serial`, `--no-hr`, `--seed`, `--speed`, `--loop`, `--hci`, `--dry-run`, `--no-log`.
  - `README.md`: exact Linux setup, troubleshooting, and what was or wasn't verified.
- **Tests:** 160 passing (59 new).
  - The GATT table is checked against spec Table 14 with a fake bleno.
  - Sample-rate timing at all 4 rates, stroke cadence, multiplexed fallback, and every control key's effect.
  - CSAFE replies, CLI parsing, model realism (mean pace, SPM, stroke values, splits, spin-down, determinism), every scenario, and log → replay being byte-identical.

### Verified on this PC

- `bluetooth-hci-socket` builds and loads (BlueZ 5.72, Realtek `0bda:b85c`, Node 22).
- bleno opens the adapter. Bluetooth is currently **switched off** here (rfkill soft-block), so bleno reports `poweredOff`, and the simulator now prints the fix.
- `npm run sim:dry` produces valid packets.

### Not verified (needs you: Bluetooth on + root steps)

- Advertising and a real connection from a phone. Turning Bluetooth on, `setcap`, and stopping `bluetoothd` need your password; see `simulator/README.md` steps 2–6.
- Whether `bluetoothd` must be stopped on this machine.

### Decisions / findings

- **bleno quirk:** the adapter is initialized while the first `stateChange` listener is being attached, so the first state was silently lost (the simulator looked hung with Bluetooth off). `peripheral.start()` now catches up on the current state.
- bleno takes the GAP device name (0x2A00) from `BLENO_DEVICE_NAME`, not from the advertised name. The simulator sets it, so both read `PM5 430000001`.
- The advert carries the 128-bit rowing-service UUID, and the name goes in the scan response (31-byte limit), like bleno's default.
- The simulator's firmware string is `SIM-1.0`, so diagnostics and logs never confuse it with a real PM5.
- The keyboard `space` overrides scenarios (a scenario can't restart rowing you stopped), and `+`/`-`/`[`/`]` apply as offsets on top of what the scenario sets.

## Phase 3: Data layer (done; not yet run on a device)

### Done

- **One parsing path for every source** (`app/src/data/PacketSource.js`): BLE, mock and replay only hand over raw bytes. Decode, logging, merging into normalized events, packet stats and stale detection are shared.
  - Events: `sample`, `stroke`, `status`, `deviceInfo`, `packet`, `error`.
  - Statuses: `connecting | connected | reconnecting | stale | disconnected | failed`.
- **`sampleMerger.js`:**
  - A `sample` is built on each 0x31 tick from the latest 0x31/0x32/0x33/0x36 data. Speed is clamped to 0–8 m/s; pace is `null` when not moving; watts come from the latest stroke power, and are 0 when not rowing.
  - A `stroke` pairs 0x35 with its 0x36 by stroke count (the PM5 sends 0x36 _after_ 0x35). If 0x36 never comes, the stroke is still emitted without power.
- **`pm5.js` (real PM5 / PC simulator):**
  - Connects with MTU 185, discovers services, and reads Device Info; a missing 0x0016 is tolerated.
  - Writes sample rate 250 ms and reads it back. If the write is refused (old firmware), it continues at 500 ms and logs it.
  - Subscribes to 0x31/0x32/0x33/0x35/0x36 and polls RSSI every 5 s. A SkiErg/BikeErg gives a warning but stays connected.
  - Reconnects with backoff 1/2/4/8 s, then every 10 s until cancelled. Bluetooth off → `failed`; when Bluetooth comes back it reconnects. Teardown removes every subscription and ignores late async results. Device-info and sample-rate setup live in `pm5Setup.js`.
- **`scanner.js`:** filters on the `PM5` name prefix, keeps one entry per device, sorts by RSSI, throttles UI updates, and times out after 15 s.
- **`mockPM5.js`:** shared rower model and scenarios → shared encoder → normal decode path. Runs at 250 ms. Covers all 10 scenarios from the brief (stall → `stale`, disconnect → `reconnecting` → `connected`, noisy, slow rate, PM5 reset, …).
- **`replaySource.js`:** plays any `.jsonl` (client app log or simulator log) with its original timing at ×1/×2/×4. A demo fixture is bundled: `app/assets/fixtures/demo-session.jsonl`, regenerated with `node simulator/scripts/make-fixture.js`.
- **`sourceManager.js`:** owns the active source. Listeners survive a source swap (the race engine can subscribe once). Pushes throttled (250 ms) state into the `useConnection` store: status, device info, packets/s per characteristic, last 40 packets.
- **Logger** (`app/src/logging/`):
  - JSONL, one file per session (`documents/logs/session-<ISO>.jsonl`). Buffered and flushed every 1 s, on app background, and on demand.
  - Keeps the last 20 files; past 10 MB a file rolls to `-partN`. Concurrent flushes are safe.
  - Line types: meta (app/build/device/Android/source), ble, packet, race, ui (screen changes), note, error (with stack, including uncaught JS errors).
- **Share logs:** a pure-JS ZIP writer (STORE, CRC-32, verified with the system `unzip -t`), then the share sheet.
- **Permissions:** Android 12+ uses BLUETOOTH_SCAN (`neverForLocation`) + BLUETOOTH_CONNECT; Android ≤ 11 uses ACCESS_FINE_LOCATION.
  - An explanation card comes before the system dialog. Denied → explanation + retry. "Don't ask again" → Open settings.
  - Bluetooth off → "Open Bluetooth settings". No BLE hardware → clear message.
- **Connect screen:** an original animated monitor illustration, 3 steps, and a device list (signal bars plus text).
  - Auto-reconnects to the last PM5. Scan timeout shows the brief's tips plus "Search again". The reconnecting state shows the next retry.
  - The connected card shows serial and firmware, then auto-continues to Home after 1.5 s (unless there is a wrong-erg warning). "Use simulator" appears in developer mode only.
- **Diagnostics screen:**
  - Shows status and detail, source, name, serial, firmware, hardware, erg type, RSSI, sample rate, packet and bad-packet counts, packets/s per characteristic, and a live decoded+hex table.
  - Buttons: Start test recording, Mark event (6 presets + free text), Share logs, Clear logs (with confirmation).
  - Developer panel: source, scenario, replay file / demo, speed.
- **Settings (partial):** language, data source (developer mode), Diagnostics, version row (7 taps toggles developer mode, also in client builds). Home's connection pill is live and opens Connect.
- **i18n:** every new string in EN/FR/AR (parity test).
- **`eas.json`:** `development` (dev-client APK) and `preview` (APK) profiles; `npm run build:dev -w app`.
- **Tests:** 201 passing (41 new).
  - pm5 with a scripted fake BleManager: connect, sample-rate refusal, missing 0x0016, SkiErg warning, the backoff sequence, retry every 10 s and stop on cancel, resubscribe with no leaked listeners, Bluetooth off/on, stale/resume, malformed packets, teardown, cancel during connect.
  - Scanner, merger, every mock scenario that changes the link, replay timing at ×1/×4, source manager, logger, and ZIP.

### Fixed along the way

- **Android manifest** (found by running `expo prebuild` and reading the generated manifest):
  - `BLUETOOTH_SCAN` was missing `neverForLocation`, because an explicit permission list stopped the BLE plugin from adding it.
  - `ACCESS_FINE_LOCATION` was declared for every Android version.
  - expo-audio added `RECORD_AUDIO` and a background-playback service; other plugins added `SYSTEM_ALERT_WINDOW` and storage permissions.

  All fixed in `app.config.js`. The manifest now only has Bluetooth, location (≤ Android 11), internet, vibrate, wake lock and audio settings.

- `MockPM5({ scenario: undefined })` overwrote the default scenario (caught by the source-manager test).

### First device run (Pixel 7, Android 17, in Expo Go)

- The app ran, but Bluetooth could not work. The logs show the app was running **inside Expo Go** (`version 58.0.5 build 466` is Expo Go's own version):
  - Expo Go has no `react-native-ble-plx` native code.
  - Expo Go's manifest doesn't declare our `BLUETOOTH_SCAN`, so Android answered "blocked" without showing a dialog, and the app wrongly said "permission turned off".
- **Fix:** `app/src/data/bleSupport.js` detects Expo Go and missing native code. The Connect screen now explains it and offers the in-app simulator. `getBleManager()` refuses to start in that case.
- The session `meta` line now logs our app version, the host's native version, `runtime` (`storeClient` = Expo Go) and `ble` support.
- **Rule:** Expo Go works for UI work with the simulator or replay sources. Anything that uses Bluetooth needs the dev client (`npm run build:dev -w app`, built once; after that `npm start` hot-reloads it exactly like Expo Go).

### First real Bluetooth run: dev client ↔ PC simulator (2026-11-15, Pixel 7 / Android 17)

- **Works end to end.** Found in 90 ms, connected in 2.3 s.
  - MTU 256, services discovered.
  - The 250 ms sample-rate write was read back as `2`, and all 5 subscriptions were made.
  - 726 packets received in 56 s, 0 malformed, stroke counts continuous (42→63).
  - Exactly 4 status packets/s; values plausible (2:05 average, 176 W, HR 138).
- **Found and fixed: the PM5 was invisible to the scan.** Android's `device.name` is the _cached_ system name for an address (`zinou-HP-250-…`, from when `bluetoothd` advertised the PC). The live advertised `localName` was `PM5 430000001`. The scanner now matches on either name, advertised name first. Every scan also logs all advertisers it saw, with both names and RSSI.
- **Found and fixed: simulator re-advertising.** After the phone disconnected, `advertisingError: Command Disallowed`. bleno already restarts advertising by itself on disconnect, and the simulator started it a second time. The simulator now tracks the advertising state from bleno's events, doesn't double-start, keeps a 1.5 s safety check plus retry, and the "hidden for N s" window survives bleno's auto-restart (4 new tests).
- **Expo Go** is detected by app ID (`host.exp.exponent`; SDK 58 Expo Go reports `executionEnvironment: bare`).
- **Observed: notification bursts.** Status packets arrive in pairs (median gap 302 ms, 10th percentile 1 ms) because Android batches notifications per connection event. The race engine must not treat arrival time as an exact clock (see PROTOCOL_NOTES).
- **Still to check:** whether `bluetoothd` must be stopped (it was stopped for this run), and the reconnection keys (`d`, `s`, `r`, `m`, rates) in phase 7.

### Not verified (no device or Android SDK on this PC)

- No dev client has been built yet; nothing has run on a phone or tablet. To build one, either:
  - `cd app && npx eas-cli login && npm run build:dev` (Expo account, cloud build), or
  - install Android Studio and run `npm run app:android` with the tablet on USB.
- End-to-end test against the PC simulator over real Bluetooth (this also answers whether `bluetoothd` must be stopped).

### Known issues

- The Phase 1 stub screens (map, workout, ready, race, results, history, onboarding) are unchanged; they are built in phases 4–6.

## Phase 4: Race engine (not started)

## Phase 5: 3D (not started)

## Phase 6: Screens and HUD (not started)

## Phase 7: Hardening and delivery (not started)
