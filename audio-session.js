// Ask supporting browsers to treat user-started audio as media playback,
// allowing iPhone playback through Silent Mode. Media volume still applies.
export function usePlaybackSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* Optional API: keep normal audio working when unsupported or denied. */ }
}
