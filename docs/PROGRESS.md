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

## Phase 4: Race engine (done)

### Done (`app/src/race/`, pure JS, no React, injected clock)

- **`engine.js`:** states `idle → ready → countdown → racing ⇄ paused → resuming → racing … → finished`. `resuming` is the 3-2-1 after reconnection, a state of its own so the HUD can show it.
  - **Modes:** `distance` (any target in m), `time` (any target in s), `free` (no target, ends with `end('exit')`). Up to 3 pace boats plus an optional PB ghost.
  - **Clock:** race time is the app's clock from GO with pauses removed. The PM5 elapsed time is never used for the clock (it starts on the first stroke, and arrives in bursts).
  - **Baselines:** PM5 distance at GO; rowing during the countdown is not counted. If GO happens with no data yet, the first sample becomes the baseline.
  - **Rebasing** keeps the race distance continuous whenever the PM5 distance jumps:
    - a PM5 reset (distance or elapsed drops) rebases with baseline 0, since the PM5 counts again from 0;
    - after signal loss, distance rowed while the link was down is not counted (the clock was stopped too);
    - a jump confirmed by 3 samples is absorbed.

    Every rebase is emitted and logged.

  - **Signal lost:**
    - no sample for 3 s, or the link going reconnecting/disconnected/failed → `paused`, with the clock rewound to the last good sample;
    - data back → 3-2-1 → racing; if it drops again during the 3-2-1 → back to paused;
    - after 60 s paused → `offerEnd` ("End race" / `keepWaiting()`).
  - **Glitches:** non-finite or null samples are ignored. A single jump larger than 15 m + 8 m/s × Δt is ignored. Speed is clamped to 0–8 m/s.
  - **Finish:** in a distance race the finish time is interpolated between the two samples around the line. In a time race, the distance at exactly the target time (extrapolated ≤ 1 s from the last sample).
- **`paceBoats.js`:** constant-pace boats; a ghost interpolated from a saved trace (it stops at its finish); ranking (finished boats first by time, then by distance); standing (rank/total, gap to the boats ahead and behind in meters and seconds).
- **`stats.js`:** time-weighted average watts and SPM, calories robust to PM5 resets, a 0.5 s distance trace (pace chart and future ghosts), and 500 m splits with interpolated times (`split` events drive voice and haptics).
- **`renderSmoother.js`:** `getRenderDistance(now)` = last distance + speed × time since the sample, with velocity feed-forward plus easing. It never goes backwards, never overshoots, and never teleports. Within 1.5 m of the truth at 60 fps with 250 ms samples.
- **`raceView.js`:** HUD `snapshot(now)` and the final `result` (time, distance, avg pace/watts/SPM, calories, splits, trace, ranked boats, rank).
- **`bindEngine.js`:** wires the engine to the source manager (samples + link status), ticks it every 100 ms, and logs `race` lines: state transitions with race/PM5 positions, baseline and offset; countdowns; rebases; glitches; splits; offerEnd; finish.
- **Tests:** 242 passing (39 new, ~95% line coverage of the race modules).
  - Scripted: normal race, countdown, baseline, splits, app clock vs PM5 elapsed, PM5 reset (distance and calories), signal loss/resume, link drop during the 3-2-1, 60 s offer, glitches (single and confirmed), speed clamp, time race (also with a pause), free mode, cancel during the countdown, config validation, pace boat ranking (live and final, distance and time), render smoothness and monotonicity, bindEngine.
  - End to end through `MockPM5` (encoder → decoder → merger → engine): steady, reset-mid-race, dropouts, noisy packets.

### Decisions

- Distance rowed while the link is down is **not** counted: the race clock is stopped then, so counting it would mean free meters.
- The pause starts at the last good sample, not when the loss is detected (3 s later).
- The engine is UI-agnostic: phase 5–6 screens call `configure / go / end / keepWaiting`, read `snapshot()` each frame and `getRenderDistance()` for the 3D boat. Multiplayer can later feed other boats through the same `boatsAt` view.

## Phase 5: 3D scene (done; not yet run on a device)

### Done (`app/src/scene/`, plain three.js builders + a thin R3F native wrapper)

- **`world.js`:** builds the whole race world into a scene and updates it once per frame from a `Frame` (user distance and stroke data, opponents, camera mode). The same code runs in the app (R3F/expo-gl) and in the web preview harness.
- **`skyWater.js`:**
  - Gradient sky dome with a sun glow, and stars for the night map.
  - Water is one cheap shader pass, with no reflection render target and no textures:
    - analytic sine-sum ripple normals, flattened with distance (less aliasing, calm from above);
    - Fresnel blend to the sky color, sun glint;
    - a V-shaped foam wake behind the boat that fades with distance and speed;
    - fog computed in the shader.
- **`boat.js`:** the user's single scull + rower, built from code.
  - Sliding seat, 2-bone legs (knee IK), leaning torso, and arms that follow the oar handles.
  - Oars with catch, drive, extraction and feathering.
  - Opponent boats are a 4-draw-call version (merged hull + rower, two rigid oars), semi-transparent and color-coded.
- **`strokeAnimator.js`:** stroke phase driven by the measured drive/recovery times (0x35) or the stroke rate. It hurries (never backwards) to the catch when the PM5 reports a drive start, and to the finish when it reports the drive end, and glides to a rest pose when rowing stops. `poseAt()` maps phase → body and oar pose.
- **`course.js`:** user in the middle lane at x = 0, opponents alternating sides.
  - Buoy lines every 10 m: one instanced draw call, only a ~380 m window around the boat. Every 100 m and the last 250 m use the accent color.
  - Distance boards every 100 m with seven-segment digits built from boxes (no text rendering needed on native).
  - Start gate, and a finish gate with a checkered banner and flags.
- **`scenery.js`:**
  - Alpine: three-layer mountain ring, snow only on the high peaks, pines.
  - Desert: dune ring and palms.
  - Night: a skyline ring of instanced towers with a generated window texture, neon posts along both banks.
  - Everything follows the camera: backdrops ride with it, trees and posts are recycled on a treadmill.
- **`cameraRig.js`:**
  - chase: spring follow with a slight stroke sway, never more than 3 m behind;
  - side: broadcast camera outside the course;
  - overhead;
  - finish: a fixed view at the line, for the Phase 6 slow-motion finish.
- **`RaceScene.jsx`:** R3F `Canvas` from `@react-three/fiber/native`. The render loop stops in the background, and the GL view is remounted on return (Android can drop the GL context). Reports FPS, draw calls and triangles.
- **`maps.js`:** the three palettes (sky, water, fog, light, backdrop, trees, shore, course colors, card gradient for Phase 6). EN/FR/AR names and moods.
- **`race/useRaceSession.js`:** wires engine ↔ source manager ↔ logger ↔ scene. The **race screen** shows the 3D scene with a temporary overlay (countdown, time, distance, rank, FPS/draw calls/triangles, camera toggle, long-press exit) so frame rate can be checked on the tablet before Phase 6. Params: `map`, `mode`, `target`.

### Budget (tests, 2 km race with 4 opponents, every map)

- < 100k triangles, < 60 draw calls, textures ≤ 1024 px (the largest is 64 px; all generated, nothing downloaded). Shadows are blob textures; no shadow maps, no post-processing.
- Android bundle: 6.1 MB (was 4.4 MB before three.js/R3F).

### Checked visually (web preview, headless Chrome with SwiftShader)

- `npm run preview:scene` bundles `tools/scene-preview/` with esbuild and serves it at `http://localhost:8765/?map=alpine|desert|night&cam=chase|side|overhead|finish`. Reference screenshots are in `docs/scene-previews/`.
- Fixed after looking at the renders:
  - the mountains read as a cloud band (uniform snow, fogged out);
  - the water looked icy (Fresnel too strong);
  - the wake was blotchy and too bright, then showed checker aliasing;
  - the buoys looked like grey rocks;
  - the side camera sat inside the course (blocked by the next lane);
  - the water looked like plaid from above.
- The app's built-in browser pane has no GPU (WebGL disabled), so screenshots were rendered with the local Chrome in headless mode with a throwaway profile.

### Not verified

- **Real device:** frame rate on the tablet, expo-gl's WebGL2 context with three r187, GL context recovery after backgrounding. Use the race screen's FPS overlay (Home → Race → … → GO, or `/race/run?map=night`).
- Jest needs three's ESM build transformed (`jest.config.js` maps `three` to `three.module.js`); the first test run is slower while Babel caches it.

### Phase 5 follow-up: character library (Mixamo)

- **Fixed: crash in Expo Go when opening the race** (`process.emitWarning is not a function`). `@react-three/fiber/native` is CommonJS and `require('three')` resolved to three r187's `three.cjs`, a Node-only shim. Metro now always resolves `three` to `build/three.module.js` (`app/metro.config.js`). Verified in an unminified bundle: the shim is no longer included. **Still to verify on the phone.**
- **Pipeline:**
  - `npm run characters`: FBX2glTF, then glTF-Transform (base map only, 512 px, simplify to ~10k triangles, quantize), bone check, catalog, bundled requires.
  - `npm run characters:thumbs`: thumbnails rendered with headless Chrome.
  - See `docs/CHARACTERS.md`.
- **Characters:** 4 bundled (Erika, Shade, Vanguard, Nova): 220 MB of FBX → 2.4 MB of GLB, plus 96 KB of thumbnails. The others are on demand from a host (`remoteBaseUrl`, not set yet).
- **`mixamoRower.js`:** one procedural driver for every Mixamo rig (hips on the seat, IK legs, spine swing, IK arms to the handles, head counter-rotation), solved in world space.
  - Bug found in the render check: the IK targets were in boat space, so the character disappeared once the boat left the start line. Fixed, and now tested at z = 0, −60 and −1500.
- **Picker:** `/characters` (Home → Rower). Bundled, downloaded or "Download · size" cards, plus the classic rower. The choice is saved in settings.
- **Scene:** the race starts with the built-in rower and swaps in the character after loading. A load failure falls back to the built-in rower and is logged.
- **Checked visually** (headless Chrome renders): characters seated with hands on the handles, from the chase and side views.
- **Not verified:**
  - on device: GLB loading through R3F native (`useLoader` + expo-asset), skinned-mesh frame rate on the tablet;
  - rowing realism: knee compression at the catch is mild, to tune later;
  - the on-demand download path: hosting is ready as GitHub Release assets (`npm run characters:publish`), but no repo is configured yet and `gh` is not installed on this PC.

## Phase 6: Screens and HUD (done; not yet run on a device)

### Done

- **Flow:** Onboarding (3 slides, then the Bluetooth explanation before the system dialog) → Connect → Home → **Choose map** → **Choose workout** → **Ready** → **Race** → **Results** → Home. Free Row uses the same flow with the workout preset to Free.
- **Choose map:** horizontal snap carousel of large cards, each with a preview image (rendered from the 3D scene at build time, `app/assets/maps/*.jpg`), name, mood and a difficulty shown as dots plus text.
- **Choose workout:**
  - Distance / Time / Free; presets as big chips plus custom input.
  - Pace boats on/off, with the target pace adjustable in ±1 s steps (boats at target −5 / 0 / +5 s).
  - PB ghost on/off, with the PB time shown or "no PB yet".
  - Voice language (EN/FR/AR). Remembered (`state/raceSetup.js`).
- **Ready:** summary (map preview, workout, opponents, rower, which links to the picker), connection pill, a big 280 dp **GO**, and a warning when the PM5 isn't connected.
- **Race HUD** (`components/hud/`):
  - Course progress bar with a dot per boat.
  - Glass panel with time (time left in time races), distance, speed and calories.
  - Center: pace gauge (pace or km/h, from Settings) and watts. The ring color shows ahead/behind target, plus an arrow and a ±s label.
  - Left: stroke rate in the accent color, pulsing on every real stroke; heart rate when present; target panel.
  - Right: gap to the boats ahead and behind (m and s), mini-map ring with km and rank ("1st / 4").
  - Hold-to-exit button (1 s fill; "Hold to finish" in free mode); camera toggle (chase/side/overhead); tabular figures throughout.
- **Countdown:** huge animated 5…1…GO. Voice "Get ready… 5, 4, 3, 2, 1… Go!" through `expo-speech` in the chosen language. Synthesized start horn (`tools/sounds/make-horn.mjs`, original sound) and haptics. 3-2-1 again when resuming after signal loss.
- **Splits:** a voice line every 500 m ("500 meters, pace 2 04") plus a haptic. Finish line and haptic at the end. Each honors the Voice / Sounds / Vibrations settings (`race/announcer.js`).
- **Signal lost:** a "Reconnecting…" overlay with the paused time; after 60 s, "End race" / "Keep waiting".
- **Finish:** the HUD hides, a "Finished · time" banner shows, and the camera moves to the finish line for 3.5 s. The result is saved to history with PB detection, then the screen moves to Results.
- **Results** (`components/ResultsView.jsx`):
  - Time to the tenth; distance, average pace, average power, calories, average rate.
  - New-PB badge.
  - Ranking table (you, pace boats, PB ghost) with finish times or distances.
  - Pace-over-distance chart (SVG) and the splits list.
  - **Back to Home after 10 s** with a visible countdown and a **Stay** button; "Race again".
- **History:** saved sessions (newest first, up to 200, AsyncStorage) with time, pace, map, PB trophy and rank. Tapping one opens the same results view, with delete (confirmed). Empty state links to Race.
- **Settings:** language, main gauge (pace / km/h), voice on/off and its language, sounds, vibrations, rower picker, data source (developer options), Diagnostics, About (7 taps).
- **i18n:** all new strings in EN/FR/AR. A test checks that every `t('…')` key used in the app exists. Menus are RTL in Arabic; the race HUD layout stays fixed.
- **Tests:** 272 passing. New: personal bests, race config (pace boats and PB ghost), trace thinning, pace series, ordinals, translation-key usage.

### Decisions

- The PB ghost replays the best saved race with the same mode and target (distance: fastest time; time: longest distance). Exits and abandoned races never count.
- Free-mode exit and "End race" still save the session (shown as "Not finished"); they never set a PB.
- Spoken pace is "2 04" rather than "2:04", which every TTS voice reads naturally.

### Not verified

- Nothing in Phase 6 has run on a device yet: layout at the tablet's real size, text sizes at font scale 1.3, TTS voices installed on the client's tablet (Arabic TTS may be missing on some Android builds), horn playback, haptics.

## Phase 7: Hardening and delivery (done; first APK not built yet)

### Done

- **End-to-end reconnection tests for every simulator key** (`app/src/race/simBridge.test.js`, 14 tests).
  - How: the real simulator core plays the PM5 behind a fake BLE manager, the real `PM5Source` connects, and the real race engine runs on top, on one fake clock.
  - Covered: connect + 250 ms; `space` stop/row (not paused while data flows); `+`/`-` pace; `[`/`]` rate; `r` PM5 reset (no jump back); `d` disconnect with auto-reconnect and resume; disconnect while hidden 5 s (backoff retries); `s` 5 s stall (stale → paused → resumes **without** reconnecting); `m` 3 malformed packets (counted, boat unaffected); `1`–`4` sample rates; old firmware refusing the rate write; a full 1000 m race through every disruption (finishes with a sane time).
- **Fixed (found by those tests):** when the sample-rate write is refused (old firmware), the app assumed 500 ms. It now reads 0x0034 back and reports the real rate.
- **App identity:** an original logo generated from code (`npm run brand`): app icon, Android adaptive icon (safe-zone foreground on the app background), splash image.
- **Versioning:** `version` and `buildNumber` in `app/package.json` are the single source; Android `versionCode` = `buildNumber`. Checked with `expo prebuild`: versionCode 1, versionName 0.1.0, launcher icons and splash generated, manifest still correct.
- **Delivery:**
  - `npm run apk` (EAS `preview` profile → installable APK);
  - `docs/RELEASE_NOTES.md` (0.1.0 build 1 + install steps);
  - `docs/CLIENT_TEST_CHECKLIST.md`, the 11 steps of the brief in English and French, each with its Mark event preset and expected result.
- **Docs:**
  - `docs/RECONNECTION_TEST.md`: every simulator key, what the app must show, and the log line to look for;
  - `README.md`: architecture diagram, scripts, data sources, logs, replay, delivery steps.
- **Tests:** 286 passing, 23 suites.

### Before sending to the client

1. `npm run apk` (needs your EAS login; EAS may ask to create a release keystore the first time; let it).
2. Install the APK on a tablet yourself: run through the checklist once against `npm run sim`, and check the frame rate (developer options show FPS on the race screen).
3. Send the APK link + checklist; collect the logs.

### Still open

- Not run on a device yet: Phases 5–7 (3D, HUD, voice, horn, haptics, characters), and the APK itself.
- Real PM5 checks listed as **[verify on PM5]** in `docs/PROTOCOL_NOTES.md` (0x0036 length, 0x0022 notify, stroke packet order, advertised name).
- Character hosting: waiting on a decision (public assets repo or another host).
- Whether `bluetoothd` must be stopped for the PC simulator.
