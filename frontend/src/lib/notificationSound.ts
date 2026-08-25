/**
 * A short synthesized two-tone chime played when an assistant reply finishes streaming
 * (settings.notificationSound) — see runStream.ts's success path. Synthesized via the Web
 * Audio API rather than shipping an audio asset, so there's no binary file to manage/license.
 */
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume();
    const now = ctx.currentTime;
    playTone(ctx, 660, now, 0.12);
    playTone(ctx, 880, now + 0.09, 0.16);
  } catch {
    // audio unavailable/blocked — not worth surfacing an error for a notification chime
  }
}
