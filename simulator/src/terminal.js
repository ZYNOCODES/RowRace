/** Keyboard controls and the live status line. */
const readline = require('readline');
const { format, SAMPLE_RATE_MS } = require('@rowrace/shared');

const KEYS_HELP =
  'space start/stop · +/- pace ±2s · [ ] spm ±1 · r PM5 reset · d disconnect · s stall 5s · m 3 bad packets · 1-4 rate · q quit';
const REPLAY_KEYS_HELP = 'space pause/resume · d disconnect · q quit';

/**
 * @param {{ core: object, peripheral: object | null, onQuit: () => void, replay: boolean }} ctx
 */
function startTerminal({ core, peripheral, onQuit, replay }) {
  const tty = process.stdin.isTTY;
  console.log(replay ? REPLAY_KEYS_HELP : KEYS_HELP);

  if (tty) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
      if ((key && key.ctrl && key.name === 'c') || str === 'q') return onQuit();
      if (replay) {
        if (str === ' ') core.togglePause();
        else if (str === 'd' && peripheral) peripheral.disconnect(0);
        return;
      }
      handleKey(str, core);
    });
  }

  const render = () => {
    const line = statusLine(core.status(), peripheral);
    if (tty) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(line.slice(0, (process.stdout.columns || 200) - 1));
    } else {
      console.log(line);
    }
  };
  const timer = setInterval(render, tty ? 250 : 5000);
  return () => {
    clearInterval(timer);
    if (tty) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\n');
  };
}

const KEY_ACTIONS = {
  ' ': (c) => c.toggleRowing(),
  '+': (c) => c.adjustPace(-2), // faster
  '=': (c) => c.adjustPace(-2),
  '-': (c) => c.adjustPace(2),
  '[': (c) => c.adjustSpm(-1),
  ']': (c) => c.adjustSpm(1),
  r: (c) => c.resetPM5('keyboard'),
  d: (c) => c.forceDisconnect(0),
  s: (c) => c.stall(5),
  m: (c) => c.queueMalformed(3),
  1: (c) => c.setSampleRate(0, 'keyboard'),
  2: (c) => c.setSampleRate(1, 'keyboard'),
  3: (c) => c.setSampleRate(2, 'keyboard'),
  4: (c) => c.setSampleRate(3, 'keyboard'),
};

function handleKey(str, core) {
  const fn = KEY_ACTIONS[str];
  if (fn) fn(core);
}

function statusLine(s, peripheral) {
  const link = !peripheral
    ? 'DRY-RUN'
    : peripheral.connectedTo
      ? `CONNECTED ${peripheral.connectedTo}`
      : peripheral.state === 'poweredOn'
        ? 'advertising…'
        : `bt:${peripheral.state}`;
  if (s.replay) {
    const pct = Math.round(s.progress * 100);
    return `${link} | REPLAY ×${s.speed} ${format.formatTime(s.position)}/${format.formatTime(s.duration)} (${pct}%) | sent ${s.sent}${s.waiting ? ' | waiting for subscribe' : ''}`;
  }
  return [
    link,
    `${SAMPLE_RATE_MS[s.sampleRate]}ms`,
    s.rowing ? 'ROWING' : 'stopped',
    `${Math.floor(s.distance)} m`,
    format.formatTime(s.elapsed),
    `${format.formatPace(s.pace)}/500`,
    `${s.spm} spm`,
    `${Math.round(s.watts)} W`,
    s.scenario,
    s.stalled ? 'STALLED' : '',
    `sent ${s.sent}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

module.exports = { startTerminal, handleKey, statusLine, KEY_ACTIONS };
