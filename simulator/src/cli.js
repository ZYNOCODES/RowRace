/** Command-line flags. No dependency: flags are few and simple. */
const { constants, format, sim } = require('@rowrace/shared');

const HELP = `PM5 simulator: makes this PC look like a Concept2 PM5 over Bluetooth LE.

Usage: npm run sim -- [options]

  --scenario <name>   ${sim.SCENARIO_NAMES.join(' | ')}  (default: steady)
  --pace <m:ss>       target pace per 500 m (default 2:05)
  --spm <n>           stroke rate (default 24)
  --rate <0-3>        start sample rate: 0=1s 1=500ms 2=250ms 3=100ms (default 1, like a PM5)
  --name "<name>"     advertised name (default "${constants.SIMULATOR_NAME}")
  --serial <9 digits> serial number (default: taken from --name)
  --no-hr             no heart-rate belt (HR reported as invalid)
  --seed <n>          random seed for drift/noise (default 42)
  --replay <file>     re-broadcast a captured .jsonl session with its original timing
  --speed <x>         replay speed: 1, 2 or 4 (default 1)
  --loop              loop the replay
  --hci <n>           use Bluetooth adapter hciN (e.g. a dedicated USB dongle)
  --dry-run           no Bluetooth: pretend an app subscribed to everything, print packets
  --no-log            don't write simulator/logs/*.jsonl
  -h, --help          this help
`;

/**
 * @param {string[]} argv process.argv.slice(2)
 */
function parseArgs(argv) {
  const o = {
    scenario: 'steady',
    pace: 125,
    spm: 24,
    rate: 1,
    name: constants.SIMULATOR_NAME,
    serial: null,
    heartRateBelt: true,
    seed: 42,
    replay: null,
    speed: 1,
    loop: false,
    hci: null,
    dryRun: false,
    log: true,
    help: false,
  };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new Error(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--scenario':
        o.scenario = need(i++, a);
        break;
      case '--pace': {
        const p = format.parseTime(need(i++, a));
        if (p == null || p < 60 || p > 400)
          throw new Error('--pace must look like 2:05 (1:00 to 6:40)');
        o.pace = p;
        break;
      }
      case '--spm':
        o.spm = intIn(need(i++, a), 10, 50, a);
        break;
      case '--rate':
        o.rate = intIn(need(i++, a), 0, 3, a);
        break;
      case '--name':
        o.name = need(i++, a);
        break;
      case '--serial':
        o.serial = need(i++, a);
        break;
      case '--no-hr':
        o.heartRateBelt = false;
        break;
      case '--seed':
        o.seed = intIn(need(i++, a), 0, 2 ** 31, a);
        break;
      case '--replay':
        o.replay = need(i++, a);
        break;
      case '--speed':
        o.speed = intIn(need(i++, a), 1, 16, a);
        break;
      case '--loop':
        o.loop = true;
        break;
      case '--hci':
        o.hci = intIn(need(i++, a), 0, 15, a);
        break;
      case '--dry-run':
        o.dryRun = true;
        break;
      case '--no-log':
        o.log = false;
        break;
      case '-h':
      case '--help':
        o.help = true;
        break;
      default:
        throw new Error(`Unknown option ${a} (see --help)`);
    }
  }
  if (!o.serial) o.serial = (o.name.match(/\d{9}/) || [constants.SIMULATOR_SERIAL])[0];
  if (!/^\d{9}$/.test(o.serial)) throw new Error('--serial must be 9 digits');
  sim.createScenario(o.scenario, { pace: o.pace, spm: o.spm }); // validates the name
  return o;
}

function intIn(v, min, max, flag) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${flag} must be an integer ${min}–${max}`);
  return n;
}

module.exports = { parseArgs, HELP };
