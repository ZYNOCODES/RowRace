/**
 * Answers CSAFE frames written to 0x0021 with a minimal, valid response for 0x0022.
 * Only the public commands the spec defines clearly get data back; everything else is
 * acknowledged with a status byte (previous frame OK) and no data. See PROTOCOL_NOTES.md.
 */
const { csafe, bytes: B } = require('@rowrace/shared');

const { CMD, STATE, PREV_FRAME_STATUS } = csafe;

const CSAFE_GETSERIAL = 0x94;
const MFG_ID_CONCEPT2 = 22;
const CLASS_ID = 2;
const MODEL_PM5 = 5;

class CsafeHandler {
  /** @param {{ serial: string, hwVersion?: number, swVersion?: number }} info */
  constructor(info) {
    this.info = info;
    this.toggle = false;
  }

  /**
   * @param {ArrayLike<number>} frameBytes
   * @param {boolean} inUse rowing in progress (state machine "In Use" vs "Ready")
   * @returns {{ response: Uint8Array, commands: { cmd: number, data: number[] }[] | null, error?: string }}
   */
  handle(frameBytes, inUse) {
    const state = inUse ? STATE.IN_USE : STATE.READY;
    const parsed = csafe.parseFrame(frameBytes);
    const commands = parsed.ok ? csafe.parseCommands(parsed.contents) : null;
    this.toggle = !this.toggle;

    if (!parsed.ok || !commands) {
      const contents = csafe.buildResponseContents(
        { toggle: this.toggle, prevStatus: PREV_FRAME_STATUS.BAD, state },
        [],
      );
      return {
        response: csafe.buildFrame(contents),
        commands: null,
        error: parsed.ok ? 'truncated command' : parsed.error,
      };
    }

    const responses = [];
    for (const { cmd } of commands) {
      const data = this.answer(cmd, state);
      if (data) responses.push({ cmd, data });
    }
    const contents = csafe.buildResponseContents(
      { toggle: this.toggle, prevStatus: PREV_FRAME_STATUS.OK, state },
      responses,
    );
    return { response: csafe.buildFrame(contents), commands };
  }

  /** @returns {number[] | null} response data, or null for "no data" */
  answer(cmd, state) {
    switch (cmd) {
      case CMD.GETSTATUS:
        return [state];
      case CMD.GETVERSION: {
        const hw = this.info.hwVersion ?? 0;
        const sw = this.info.swVersion ?? 0;
        return [MFG_ID_CONCEPT2, CLASS_ID, MODEL_PM5, hw & 0xff, hw >> 8, sw & 0xff, sw >> 8];
      }
      case CSAFE_GETSERIAL:
        return Array.from(B.writeAscii(this.info.serial, 9));
      default:
        return null;
    }
  }
}

module.exports = { CsafeHandler };
