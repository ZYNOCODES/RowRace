/**
 * Race feedback: voice (expo-speech), start horn (expo-audio) and haptics (expo-haptics),
 * each honoring its setting. Every call is fire-and-forget and never throws.
 */
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio';
import { format } from '@rowrace/shared';
import { useSettings } from '../state/settings';
import { SPEECH_LOCALES, translate } from '../i18n/translate';

let horn = null;

const prefs = () => {
  const s = useSettings.getState();
  const lang = s.voiceLanguage || s.language;
  return { s, lang, locale: SPEECH_LOCALES[lang] || 'en-US' };
};

function say(key, params, { interrupt = false } = {}) {
  const { s, lang, locale } = prefs();
  if (!s.voiceOn) return;
  try {
    if (interrupt) Speech.stop();
    Speech.speak(translate(lang, key, params), { language: locale, rate: 1.05 });
  } catch {
    // no TTS engine: silent
  }
}

function buzz(kind) {
  if (!useSettings.getState().hapticsOn) return;
  const run =
    kind === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(
          kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
        );
  run.catch(() => {});
}

function playHorn() {
  if (!useSettings.getState().soundsOn) return;
  try {
    horn ??= createAudioPlayer(require('../../assets/sounds/horn.wav'));
    horn.seekTo(0);
    horn.play();
  } catch {
    // audio unavailable: silent
  }
}

/** Spoken pace "2:04" → "2 04" (reads naturally in every TTS language). */
const spokenPace = (sec) => format.formatPace(sec).replace(':', ' ');

export const announcer = {
  /** @param {number} n 5…1, 0 = GO */
  countdown(n) {
    if (n === 5) say('voice.getReady', null, { interrupt: true });
    if (n > 0) {
      say('voice.number', { n });
      buzz('medium');
    } else {
      say('voice.go', null, { interrupt: true });
      playHorn();
      buzz('heavy');
    }
  },
  resumeCountdown(n) {
    if (n > 0) say('voice.number', { n });
    else say('voice.go', null, { interrupt: true });
    buzz(n > 0 ? 'medium' : 'heavy');
  },
  split(split) {
    say('voice.split', { distance: split.distance, pace: spokenPace(split.pace) });
    buzz('medium');
  },
  paused() {
    say('voice.paused', null, { interrupt: true });
  },
  finish(result) {
    const key = result.mode === 'time' ? 'voice.finishTime' : 'voice.finish';
    say(
      key,
      {
        time: format.formatTime(result.time).replace(':', ' '),
        distance: Math.round(result.distance),
      },
      { interrupt: true },
    );
    buzz('success');
  },
  stop() {
    try {
      Speech.stop();
    } catch {
      // nothing to stop
    }
  },
};
