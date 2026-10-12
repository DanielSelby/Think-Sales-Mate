let warningAudioContext: AudioContext | null = null;

export function playStockWarningSound() {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) {
    console.warn("Stock warning sound is unavailable in this browser.");
    return;
  }

  warningAudioContext ??= new AudioContextConstructor();
  const context = warningAudioContext;
  const playTone = () => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + 0.34);
  };

  if (context.state === "suspended") {
    void context.resume().then(playTone).catch((error: unknown) => {
      console.warn("Stock warning sound could not be played:", error);
    });
    return;
  }
  playTone();
}
