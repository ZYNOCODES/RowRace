# Reconnection test with the PC simulator (developer)

Every simulator key from the brief (§5), what the app must do, and where it's automated.
The same scenarios run automatically on every `npm test` in `app/src/race/simBridge.test.js`:
the real simulator core plays the PM5, the real `PM5Source` connects to it, and the real race engine runs on top.
This page is the manual version, over real Bluetooth.

## Setup

```bash
sudo systemctl stop bluetooth && sudo hciconfig hci0 up   # see simulator/README.md
npm run sim                                                 # terminal 1
npm start                                                   # terminal 2; open in the RowRace dev client
```

On the tablet: Settings → (7 taps on the version) → developer options on; Diagnostics stays open in a second window if you like.
Start a **2 km race** (Race → map → 2 km → GO) and row it with the keys below.
Before each step, press **Diagnostics → Mark event** so the log shows where each step starts.

| Key       | Simulator does                         | App must show                                                                                      | Log line to look for                                                                    |
| --------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| (connect) | advertises `PM5 430000001`             | found in < 2 s; serial `430000001`, firmware `SIM-1.0`; 250 ms rate                                | `ble sampleRate.ok ms 250`                                                              |
| `space`   | stops rowing, flywheel spins down      | speed → 0, pace `--:--`, stroke rate 0. **Not paused** (data keeps coming). `space` again resumes. | `packet 0x0031 rowingState 0`                                                           |
| `+` / `-` | pace ±2 s/500 m                        | gauge pace changes, ring color flips vs target                                                     |                                                                                         |
| `[` / `]` | stroke rate ±1                         | stroke rate updates, oars speed up or slow down                                                    |                                                                                         |
| `r`       | PM5 reset: distance and time back to 0 | race distance **keeps going**, no jump back                                                        | `race rebase reason pm5-reset`                                                          |
| `d`       | drops the link                         | "Reconnecting…", then connected again (1 s backoff), 3-2-1, race resumes; the outage isn't counted | `ble disconnected` → `status reconnecting` → `status connected` → `race state resuming` |
| `s`       | silent 5 s, link kept                  | after 3 s "Reconnecting…" (stale); resumes with 3-2-1 **without** reconnecting                     | `status stale` → `race state paused`                                                    |
| `m`       | 3 bad packets                          | nothing visible; Diagnostics "Bad packets" +3                                                      | `packet … decoded ok:false`                                                             |
| `1`–`4`   | rate 1 s / 500 ms / 250 ms / 100 ms    | Diagnostics packets/s for 0x0031 ≈ 1 / 2 / 4 / 10; boat motion stays smooth                        | `ble sampleRate value …` (simulator log)                                                |
| `q`       | quits                                  | "Reconnecting…" every 10 s until the simulator is back (`npm run sim` again)                       | backoff 1, 2, 4, 8, 10, 10 s                                                            |

Scenarios that combine keys: `npm run sim -- --scenario dropouts`, `disconnect`, `reset-mid-race`, `noisy`, `slow-rate`.

Afterwards: **Diagnostics → Share logs** and compare with the simulator's own log in `simulator/logs/`, which records the same timeline from the PM5 side.
