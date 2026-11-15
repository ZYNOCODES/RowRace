# PM5 simulator (Linux)

This program makes your Linux PC look like a **Concept2 PM5** over real Bluetooth LE. The
phone/tablet app connects to it exactly as it would to a real PM5: same name pattern
(`PM5 430000001`), same GATT services and characteristics, same byte layouts (it encodes with
`shared/pm5/encode.js`, the inverse of what the app decodes).

It uses [`@abandonware/bleno`](https://github.com/abandonware/bleno), which talks to the
Bluetooth controller directly through a raw HCI socket (BlueZ kernel driver).

```bash
npm run sim                      # steady 2:05 / 24 spm
npm run sim -- --scenario sprint --pace 2:00 --spm 26
npm run sim -- --replay ./logs/client-session.jsonl --speed 2
npm run sim:dry                  # no Bluetooth: prints packets, handy to check the setup
```

---

## 1. Requirements

|             | Tested here                                | Notes                                        |
| ----------- | ------------------------------------------ | -------------------------------------------- |
| OS          | Ubuntu, kernel 7.0                         | Any recent Linux with BlueZ 5.x              |
| BlueZ       | 5.72 (`bluetoothctl --version`)            |                                              |
| Node.js     | 22.19                                      | Node 20+                                     |
| Adapter     | Realtek USB `0bda:b85c` (built in), `hci0` | Must support Bluetooth 4.0+ (LE)             |
| Build tools | `make`, `g++`, `python3`                   | For the native `bluetooth-hci-socket` module |

Install the build tools and Bluetooth packages if they're missing:

```bash
sudo apt install build-essential python3 bluetooth bluez libbluetooth-dev libudev-dev
```

`npm install` at the repo root builds the native module. Check it loaded:

```bash
node -e "require('@abandonware/bluetooth-hci-socket'); console.log('ok')"
```

## 2. Permission for raw Bluetooth (once per Node install)

bleno needs the `CAP_NET_RAW` capability. Grant it to the Node binary so you don't have to run
as root:

```bash
sudo setcap cap_net_raw+eip $(eval readlink -f $(which node))
getcap $(eval readlink -f $(which node))     # should print: cap_net_raw=eip
```

- Run it again whenever Node is upgraded or you switch versions with nvm (the binary path changes).
- This lets **every** Node script open raw network sockets. If you'd rather not, skip it and start the simulator with `sudo -E env "PATH=$PATH" npm run sim`.

## 3. Turn the adapter on

```bash
rfkill list bluetooth               # "Soft blocked: yes" means Bluetooth is switched off
rfkill unblock bluetooth
sudo hciconfig hci0 up
hciconfig hci0                      # should show "UP RUNNING"
```

(`bluetoothctl power on` also works while `bluetoothd` is running.)

## 4. `bluetoothd`: stop it while the simulator runs

`bluetoothd` (the system Bluetooth service) uses the same adapter. It can answer GATT requests
itself, fight bleno over advertising, or reset the controller. **Recommended:** stop it while
you use the simulator.

```bash
sudo systemctl stop bluetooth
sudo hciconfig hci0 up              # stopping bluetoothd can power the adapter down
npm run sim
```

Restore it afterwards (your headphones, mouse, etc. need it):

```bash
sudo systemctl start bluetooth
```

### Optional: a dedicated USB dongle

If the built-in adapter is flaky, or you want to keep `bluetoothd` running for other
devices, plug in a USB Bluetooth 4.0+ dongle and give it to the simulator:

```bash
hciconfig                           # find the dongle, e.g. hci1
sudo hciconfig hci1 up
npm run sim -- --hci 1
```

`bluetoothd` still sees the dongle. If it interferes, power the dongle off on the BlueZ side
(`sudo btmgmt --index 1 power off`) and bring it up again with `sudo hciconfig hci1 up`.

## 5. Check the adapter

```bash
hciconfig -a hci0                   # UP RUNNING, BD address, "LE" in features
sudo btmgmt info                    # supported settings should include "le" and "advertising"
sudo btmon                          # live HCI trace (in another terminal), very useful
```

## 6. Connect from the phone

1. Start the simulator. The status line shows `advertising…`.
2. **Quick check without the app:** in **nRF Connect** (Android), scan for `PM5 430000001`, connect, and you should see:
   - `CE060010…` Device information (model `PM5`, serial `430000001`, firmware `SIM-1.0`, manufacturer `Concept2`, erg type `0`)
   - `CE060020…` Control (`0021` write, `0022` read/notify)
   - `CE060030…` Rowing (`0031`–`0036`, `0080`)

   Enable notifications on `0031`: a 19-byte value arrives every 500 ms. Write `02` to `0034` and it speeds up to every 250 ms.

3. In the app: Settings → Data source → **Real PM5 (Bluetooth)**, then Connect.

The status line shows `CONNECTED <phone address>`, the sample rate, distance, time, pace, SPM, watts and the packet count.

## 7. Keyboard controls

| Key             | Action                                                      |
| --------------- | ----------------------------------------------------------- |
| `space`         | start / stop rowing (works in every scenario)               |
| `+` / `-`       | pace 2 s/500 m faster / slower                              |
| `[` / `]`       | stroke rate −1 / +1                                         |
| `r`             | **PM5 reset**: distance and time back to 0 mid-session      |
| `d`             | force a disconnect (the simulator re-advertises right away) |
| `s`             | stall: stay connected but send nothing for 5 s              |
| `m`             | send the next 3 packets with a wrong length                 |
| `1` `2` `3` `4` | sample rate 1 s / 500 ms / 250 ms / 100 ms                  |
| `q` or Ctrl-C   | quit (closes the log file)                                  |

In replay mode: `space` pause/resume, `d` disconnect, `q` quit.

## 8. Options and scenarios

Run `npm run sim -- --help` for the full list.

| Scenario           | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `steady` (default) | constant target pace with a slow ±2 s human drift                 |
| `sprint`           | steady, then from 60 s: −10 s/500 m and +8 spm                    |
| `fatigue`          | pace gets 0.06 s/500 m slower every second                        |
| `intervals`        | 60 s rowing / 30 s rest                                           |
| `stop-go`          | row 20 s, stop 5 s (rowing state inactive)                        |
| `reset-mid-race`   | PM5 reset at 30 s                                                 |
| `disconnect`       | link dropped for 5 s every 60 s (hidden, then re-advertises)      |
| `dropouts`         | every 30 s, alternately a 5 s stall and a 5 s disconnect          |
| `noisy`            | 1% of packets have a wrong length                                 |
| `slow-rate`        | old firmware: always 1 s, and refuses the app's sample-rate write |
| `manual`           | nothing automatic; use the keyboard                               |

The rower model and scenarios live in `shared/sim/`, so the in-app simulator uses exactly the same ones.

**Notifications:** status (`0031`–`0033`) is sent at the sample rate; stroke data (`0035`, `0036`) once per stroke at the end of the drive. Each goes to its own characteristic if the app subscribed to it. Otherwise, if the app subscribed to `0080`, it's sent multiplexed (with the multiplexed layouts from the spec).

**CSAFE:** frames written to `0021` are logged and answered on `0022` (read + notify). `GETSTATUS`, `GETVERSION` (Concept2 / PM5) and `GETSERIAL` return data; other commands get a status-only response; bad frames get "previous frame: bad".

## 9. Logs and replay

Every run writes `simulator/logs/<timestamp>.jsonl` (turn it off with `--no-log`). It uses the same format as the app's logs (`shared/log/format.js`):

```json
{"v":1,"t":1763208000000,"type":"packet","dir":"notify","char":"0x0031","hex":"33000019…","decoded":{…}}
{"v":1,"t":1763208000120,"type":"ble","event":"pm5.reset","source":"keyboard"}
```

`dir` is the GATT operation: `notify`/`read` = PM5 → app, `write` = app → PM5.

**Replay a client session over Bluetooth:**

```bash
npm run sim -- --replay ~/Downloads/session-2026-11-20T18-03-11.jsonl
npm run sim -- --replay ./logs/x.jsonl --speed 4 --loop
```

Only the PM5 → app packets are re-sent, with their original timing (×1, ×2, ×4). The clock starts when the app subscribes, so nothing is lost while it's connecting. If the app only subscribed to `0080`, individual packets are decoded and re-encoded in the multiplexed layout.

## 10. Troubleshooting

| Symptom                                                                 | Cause                                                      | Fix                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `[bluetooth] poweredOff`                                                | Adapter switched off or rfkill-blocked                     | Step 3                                                                            |
| `[bluetooth] unauthorized` / `EPERM`                                    | No `CAP_NET_RAW`                                           | Step 2, or run with sudo                                                          |
| `[bluetooth] unsupported`                                               | Adapter has no LE support, or wrong index                  | `--hci 1` (dongle), check `hciconfig -a`                                          |
| `ENETDOWN` in `DEBUG=hci` output                                        | Same as poweredOff                                         | `sudo hciconfig hci0 up`                                                          |
| Phone sees the PC under its **hostname**, not `PM5 …`                   | `bluetoothd` is advertising / serving GATT                 | Stop `bluetoothd` (step 4)                                                        |
| Phone finds it but connection fails right away, or services are missing | `bluetoothd` answering GATT, or a stale cache on the phone | Stop `bluetoothd`; on Android, turn Bluetooth off/on or "Forget" the device       |
| `Error: Cannot find module …bluetooth_hci_socket.node`                  | Native module not built                                    | Install the step 1 packages, then `npm rebuild @abandonware/bluetooth-hci-socket` |
| Works once, then the phone can't find it after a disconnect             | Advertising didn't restart                                 | Press `d` (forces a clean disconnect and re-advertise), or restart the simulator  |
| Need to see what's going on                                             |                                                            | `DEBUG=hci,gatt,bindings npm run sim`, and `sudo btmon` in another terminal       |

## What was verified

**Verified on the development PC (BlueZ 5.72, Realtek `0bda:b85c`, Node 22):**

- Native `bluetooth-hci-socket` builds and loads.
- bleno opens the adapter; with Bluetooth soft-blocked it reports `poweredOff` (`ENETDOWN`) and the simulator prints the fix.
- `--dry-run` produces valid packets; `--help` and flag errors.
- Automated tests (`npm test`, `simulator/src/*.test.js`, `shared/test/sim.test.js`): the GATT table matches spec Table 14 (services, characteristics, properties, device-info values); sample rates (1 s / 500 ms / 250 ms / 100 ms); stroke packets once per stroke; multiplexed fallback; stall, malformed packets, PM5 reset, forced disconnect, locked rate; CSAFE responses; and log → replay giving byte-identical packets.

**Not verified yet (needs Bluetooth switched on plus root steps 2–4, which need your password):**

- Advertising and a real connection from a phone (nRF Connect / the app).
- Whether `bluetoothd` really has to be stopped on this machine, or whether it can stay running.
- Reconnecting after `d` / scenario disconnects with a real phone.
- The USB-dongle setup.

Please run steps 2–6 once and report what you see. Phase 7 tests reconnection against every key above.
