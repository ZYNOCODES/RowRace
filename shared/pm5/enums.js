/**
 * Enumerated values from "Concept2 PM CSAFE Communication Definition" rev 0.31, Appendix A.
 * Each enum exposes its constants plus `label(value)` for logs and the Diagnostics screen.
 */

/**
 * @param {Record<string, [number, string]>} entries
 * @returns {Readonly<Record<string, number> & { label: (v: number) => string, values: number[] }>}
 */
function defineEnum(entries) {
  const out = {};
  const labels = {};
  for (const [key, [value, text]] of Object.entries(entries)) {
    out[key] = value;
    labels[value] = text;
  }
  out.values = Object.keys(labels).map(Number);
  out.label = (v) => (v in labels ? labels[v] : `Unknown (${v})`);
  return Object.freeze(out);
}

const OperationalState = defineEnum({
  RESET: [0, 'Reset'],
  READY: [1, 'Ready'],
  WORKOUT: [2, 'Workout'],
  WARMUP: [3, 'Warm-up'],
  RACE: [4, 'Race'],
  POWEROFF: [5, 'Power off'],
  PAUSE: [6, 'Pause'],
  INVOKEBOOTLOADER: [7, 'Invoke boot loader'],
  POWEROFF_SHIP: [8, 'Power off (ship)'],
  IDLE_CHARGE: [9, 'Idle charge'],
  IDLE: [10, 'Idle'],
  MFGTEST: [11, 'Manufacturing test'],
  FWUPDATE: [12, 'Firmware update'],
  DRAGFACTOR: [13, 'Drag factor'],
  DFCALIBRATION: [100, 'Drag factor calibration'],
});

const ErgModelType = defineEnum({
  D: [0, 'Model D/E'],
  C: [1, 'Model C/B'],
  A: [2, 'Model A'],
});

const ErgMachineType = defineEnum({
  STATIC_D: [0, 'RowErg Model D'],
  STATIC_C: [1, 'RowErg Model C'],
  STATIC_A: [2, 'RowErg Model A'],
  STATIC_B: [3, 'RowErg Model B'],
  STATIC_E: [5, 'RowErg Model E'],
  STATIC_SIMULATOR: [7, 'Rower simulator'],
  STATIC_DYNAMIC: [8, 'Dynamic RowErg'],
  SLIDES_A: [16, 'Model A on slides'],
  SLIDES_B: [17, 'Model B on slides'],
  SLIDES_C: [18, 'Model C on slides'],
  SLIDES_D: [19, 'Model D on slides'],
  SLIDES_E: [20, 'Model E on slides'],
  LINKED_DYNAMIC: [32, 'Dynamic, linked'],
  STATIC_DYNO: [64, 'Dynamometer'],
  STATIC_SKI: [128, 'SkiErg'],
  STATIC_SKI_SIMULATOR: [143, 'SkiErg simulator'],
  BIKE: [192, 'BikeErg'],
  BIKE_ARMS: [193, 'BikeErg (arms)'],
  BIKE_NOARMS: [194, 'BikeErg (no arms)'],
  BIKE_SIMULATOR: [207, 'BikeErg simulator'],
  MULTIERG_ROW: [224, 'MultiErg row'],
  MULTIERG_SKI: [225, 'MultiErg ski'],
  MULTIERG_BIKE: [226, 'MultiErg bike'],
});

/** @returns {'rower'|'ski'|'bike'|'unknown'} */
function ergFamily(machineType) {
  const t = Number(machineType);
  if (t === ErgMachineType.MULTIERG_SKI || (t >= 128 && t <= 143)) return 'ski';
  if (t === ErgMachineType.MULTIERG_BIKE || (t >= 192 && t <= 207)) return 'bike';
  if (t === ErgMachineType.MULTIERG_ROW || (t >= 0 && t <= 64)) return 'rower';
  return 'unknown';
}

const WorkoutType = defineEnum({
  JUSTROW_NOSPLITS: [0, 'Just Row, no splits'],
  JUSTROW_SPLITS: [1, 'Just Row, splits'],
  FIXEDDIST_NOSPLITS: [2, 'Fixed distance, no splits'],
  FIXEDDIST_SPLITS: [3, 'Fixed distance, splits'],
  FIXEDTIME_NOSPLITS: [4, 'Fixed time, no splits'],
  FIXEDTIME_SPLITS: [5, 'Fixed time, splits'],
  FIXEDTIME_INTERVAL: [6, 'Fixed time interval'],
  FIXEDDIST_INTERVAL: [7, 'Fixed distance interval'],
  VARIABLE_INTERVAL: [8, 'Variable interval'],
  VARIABLE_UNDEFINEDREST_INTERVAL: [9, 'Variable interval, undefined rest'],
  FIXEDCALORIE_SPLITS: [10, 'Fixed calorie, splits'],
  FIXEDWATTMINUTE_SPLITS: [11, 'Fixed watt-minute, splits'],
  FIXEDCALS_INTERVAL: [12, 'Fixed calorie interval'],
  FIXEDWATTMIN_INTERVAL: [13, 'Fixed watt-minute interval'],
});

const IntervalType = defineEnum({
  TIME: [0, 'Time'],
  DIST: [1, 'Distance'],
  REST: [2, 'Rest'],
  TIMERESTUNDEFINED: [3, 'Time, undefined rest'],
  DISTANCERESTUNDEFINED: [4, 'Distance, undefined rest'],
  RESTUNDEFINED: [5, 'Undefined rest'],
  CALORIE: [6, 'Calorie'],
  CALORIERESTUNDEFINED: [7, 'Calorie, undefined rest'],
  WATTMINUTE: [8, 'Watt-minute'],
  WATTMINUTERESTUNDEFINED: [9, 'Watt-minute, undefined rest'],
  NONE: [255, 'None'],
});

const WorkoutState = defineEnum({
  WAITTOBEGIN: [0, 'Wait to begin'],
  WORKOUTROW: [1, 'Workout row'],
  COUNTDOWNPAUSE: [2, 'Countdown pause'],
  INTERVALREST: [3, 'Interval rest'],
  INTERVALWORKTIME: [4, 'Interval work time'],
  INTERVALWORKDISTANCE: [5, 'Interval work distance'],
  INTERVALRESTENDTOWORKTIME: [6, 'Interval rest end to work time'],
  INTERVALRESTENDTOWORKDISTANCE: [7, 'Interval rest end to work distance'],
  INTERVALWORKTIMETOREST: [8, 'Interval work time to rest'],
  INTERVALWORKDISTANCETOREST: [9, 'Interval work distance to rest'],
  WORKOUTEND: [10, 'Workout end'],
  TERMINATE: [11, 'Terminate'],
  WORKOUTLOGGED: [12, 'Workout logged'],
  REARM: [13, 'Rearm'],
});

const RowingState = defineEnum({
  INACTIVE: [0, 'Inactive'],
  ACTIVE: [1, 'Active'],
});

const StrokeState = defineEnum({
  WAITING_FOR_MIN_SPEED: [0, 'Waiting for flywheel min speed'],
  WAITING_FOR_ACCELERATE: [1, 'Waiting for flywheel to accelerate'],
  DRIVING: [2, 'Driving'],
  DWELLING_AFTER_DRIVE: [3, 'Dwelling after drive'],
  RECOVERY: [4, 'Recovery'],
});

const WorkoutDurationType = defineEnum({
  TIME: [0x00, 'Time'],
  CALORIES: [0x40, 'Calories'],
  DISTANCE: [0x80, 'Distance'],
  WATTMIN: [0xc0, 'Watt-minutes'],
});

/** 0x0034 sample rate values → interval in milliseconds. */
const SampleRate = defineEnum({
  RATE_1000MS: [0, '1 s'],
  RATE_500MS: [1, '500 ms'],
  RATE_250MS: [2, '250 ms'],
  RATE_100MS: [3, '100 ms'],
});
const SAMPLE_RATE_MS = Object.freeze({ 0: 1000, 1: 500, 2: 250, 3: 100 });

module.exports = {
  defineEnum,
  OperationalState,
  ErgModelType,
  ErgMachineType,
  ergFamily,
  WorkoutType,
  IntervalType,
  WorkoutState,
  RowingState,
  StrokeState,
  WorkoutDurationType,
  SampleRate,
  SAMPLE_RATE_MS,
};
