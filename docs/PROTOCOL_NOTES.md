# PM5 protocol notes

Source of truth: `docs/Concept2 PM CSAFE Communication Definition.pdf` (rev 0.31), section
"Smart Bluetooth" (Table 14), "C2 Multiplexed Information: Data Definitions" (Table 15),
Appendix A (enums) and Appendix B (pace conversions).

This file records where the PDF differs from the original build brief, and every choice
made where the PDF is ambiguous. Items marked **[verify on PM5]** must be checked on the
client's real machine; the client test logs record the raw hex of every packet so we can check them.

## Differences between the PDF and the brief (the PDF wins)

| #   | Topic                                  | Brief                    | PDF                                                                    | What the code does                                                                                                                                                                               |
| --- | -------------------------------------- | ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `0x0036` Additional Stroke Data length | 15 bytes                 | **18 bytes**: adds `Projected Work Other` (24-bit) at bytes 15–17      | Decoder accepts ≥ 15 bytes and reads `projectedWorkOther` only when present. Encoder/simulator send 18. **[verify on PM5]** what length really arrives.                                          |
| 2   | Multiplexed `0x33`                     | not stated               | **18 bytes**: no `Average Power` (it moved into multiplexed `0x32`)    | Separate `MUX_ADDITIONAL_STATUS_2` layout.                                                                                                                                                       |
| 3   | Multiplexed `0x35`                     | not stated               | **18 bytes**: no `Work Per Stroke`                                     | Separate `MUX_STROKE_DATA` layout.                                                                                                                                                               |
| 4   | Multiplexed `0x36`                     | not stated               | **17 bytes**: `Work Per Stroke` appended, no `Projected Work Other`    | Separate `MUX_ADDITIONAL_STROKE_DATA` layout.                                                                                                                                                    |
| 5   | Multiplexed `0x32`                     | 19 bytes, adds avg power | Same, and the PDF places `Average Power` **before** `Erg Machine Type` | Matches the PDF.                                                                                                                                                                                 |
| 6   | `0x0022` Control transmit              | READ / NOTIFY            | **READ** only in Table 14                                              | Simulator offers read + notify (works for both kinds of client). The app should read `0x0022` after a write and subscribe only if the characteristic reports `isNotifiable`. **[verify on PM5]** |
| 7   | Device Info `0x0016` erg type          | always readable          | Only valid on PM5 firmware V150–V199.99 and V204–V299.99               | The app must tolerate a failed read and fall back to the erg type in `0x0032` byte 16.                                                                                                           |

## Ambiguities and the choice made

1. **Heart rate.** PDF: 255 = invalid. We also map **0 → `null`**, since a real 0 bpm reading isn't possible.
2. **Pace when not moving.** `currentPace` / `paceSecPer500` is `null` when speed is 0 **or** the raw pace is 0. `averagePace` and `splitAvgPace` are `null` when the raw value is 0. Never `Infinity` or `NaN`.
3. **Split/interval average calories (`0x0033` bytes 12–13).** The individual characteristic says "cals/hr", the multiplexed table says "cals". We use **cal/hr**. **[verify on PM5]**
4. **Workout duration (`0x0031` bytes 14–16).** The PDF only gives the unit for time (0.01 s). For the other duration types (`0x40` calories, `0x80` distance, `0xC0` watt-minutes) the raw integer is passed through unchanged (we assume cal / m / watt-min).
5. **Device-info strings.** Fixed sizes from Table 14 (model 16, serial 9, hardware 3, firmware 20, manufacturer 16). The real padding byte is unknown, so the decoder stops at the first NUL and trims whitespace. The simulator pads with NUL.
6. **Erg machine type enum.** The PDF comment for `ERGMACHINE_TYPE_STATIC_DYNO` says "(32)" but the value is `= 64`; we use 64 (the code wins over the comment).
7. **Packet longer than expected.** Decoders accept extra trailing bytes, which newer firmware could add, and ignore them.
8. **PM5 elapsed time** starts on the first stroke, so the race engine runs its own clock from GO (as the brief says).
9. **Unused characteristics.** `0x0017` (ATT MTU), `0x0018` (LL DLE), `0x0037`–`0x003F` and `0x0042` exist in the PDF but the MVP does not use them. Multiplexed IDs other than 0x31/32/33/35/36 decode to `{ ok: false, unsupported: true }`.

## Physics (Appendix B)

```
pace (s/m)    = pace500 / 500
Watts         = 2.8 / pace³
Calories / hr = (2.8 / pace³) * (4.0 * 0.8604) + 300
```

## CSAFE framing (implemented in `shared/pm5/csafe.js`)

- Standard frame `F1 … F2`; extended frame `F0 dest src … F2`.
- Byte stuffing: `F0..F3` → `F3 00..03`, applied to addresses, contents and checksum.
- Checksum: XOR of the unstuffed frame contents (addresses excluded).
- Response contents: status byte (bit 7 frame toggle, bits 4–5 previous frame status, bits 0–3 state), then `[cmd, count, data…]` per command.
- Limits: 120-byte max frame, 50 ms minimum gap between frames.
- **Not implemented (not needed by the MVP):** splitting a frame larger than 20 bytes across several BLE writes, and the PM proprietary command sets behind the `0x76/0x77/0x7E/0x7F` wrappers.
