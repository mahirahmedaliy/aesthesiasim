class MedicalAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isAlarmMuted: boolean = false;
  private lastBeepTime: number = 0;
  private lastAlarmTime: number = 0;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public silenceAlarms() {
    this.isAlarmMuted = true;
    setTimeout(() => {
      this.isAlarmMuted = false;
    }, 60000); // 60s alarm silence like real monitors
  }

  // Play realistic QRS pulse beep with SpO2-modulated pitch
  public playQrsBeep(spo2: number) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    // Pitch mapping: SpO2 100% = ~880 Hz, SpO2 70% = ~330 Hz
    const clampedSpo2 = Math.max(65, Math.min(100, spo2));
    const freq = 300 + Math.pow((clampedSpo2 - 60) / 40, 1.8) * 580;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Fast envelope (80ms blip)
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.085);
  }

  // Play high priority critical medical alarm chime (3 rapid warning tones)
  public playCriticalAlarm() {
    if (this.isMuted || this.isAlarmMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this.lastAlarmTime < 4.0) return; // rate limit alarm repetitions
    this.lastAlarmTime = now;

    const tones = [880, 880, 880];
    tones.forEach((freq, idx) => {
      const startTime = now + idx * 0.16;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.05, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.13);
    });
  }

  private flatlineOsc: OscillatorNode | null = null;
  private flatlineGain: GainNode | null = null;

  // Continuous high-pitched flatline tone (asystole / biological death)
  public playFlatlineTone() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || this.flatlineOsc) return;

    try {
      this.flatlineOsc = this.ctx.createOscillator();
      this.flatlineGain = this.ctx.createGain();

      this.flatlineOsc.type = 'sine';
      this.flatlineOsc.frequency.setValueAtTime(800, this.ctx.currentTime); // Standard 800 Hz ICU flatline tone

      this.flatlineGain.gain.setValueAtTime(0.06, this.ctx.currentTime);

      this.flatlineOsc.connect(this.flatlineGain);
      this.flatlineGain.connect(this.ctx.destination);

      this.flatlineOsc.start();
    } catch {
      // Audio context might be restricted
    }
  }

  public stopFlatlineTone() {
    if (this.flatlineOsc) {
      try {
        this.flatlineOsc.stop();
        this.flatlineOsc.disconnect();
      } catch {}
      this.flatlineOsc = null;
    }
    if (this.flatlineGain) {
      try {
        this.flatlineGain.disconnect();
      } catch {}
      this.flatlineGain = null;
    }
  }

  // Defibrillator charging / discharge or drug push chime
  public playActionChime(positive: boolean = true) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    if (positive) {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.16); // G5
    } else {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.15);
    }

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }
}

export const audioEngine = new MedicalAudioEngine();
