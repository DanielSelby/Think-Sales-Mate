let scannerAudioContext: AudioContext | null = null;

export function prepareBarcodeScanSound() {
  if (typeof window === "undefined" || !window.AudioContext) return;
  scannerAudioContext ??= new window.AudioContext();
  if (scannerAudioContext.state === "suspended") {
    void scannerAudioContext.resume().catch((error: unknown) => {
      console.warn("Barcode scanner sound could not be enabled:", error);
    });
  }
}

export function playBarcodeScanSound(success: boolean) {
  if (typeof window === "undefined" || !window.AudioContext) return;

  prepareBarcodeScanSound();
  if (!scannerAudioContext) return;
  const context = scannerAudioContext;
  const playTone = () => {
    const now = context.currentTime;
    const frequencies = success ? [880, 1320] : [330, 220];
    frequencies.forEach((frequency, index) => {
      const startAt = now + index * 0.12;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = success ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.1);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.11);
    });
  };

  if (context.state === "suspended") {
    void context.resume().then(playTone).catch((error: unknown) => {
      console.warn("Barcode scanner sound could not be played:", error);
    });
    return;
  }
  playTone();
}
