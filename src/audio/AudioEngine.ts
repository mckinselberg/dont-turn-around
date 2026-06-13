import * as Tone from 'tone';

export class AudioEngine {
  private static started = false;

  static async start(): Promise<void> {
    if (!this.started) {
      await Tone.start();
      Tone.getDestination().volume.value = -6;
      this.started = true;
    }
  }

  static isStarted(): boolean {
    return this.started;
  }

  // Create a simple noise-based wind layer
  static createWindLayer(): { start: () => void; stop: () => void; setIntensity: (v: number) => void } {
    const noise = new Tone.Noise('pink');
    const filter = new Tone.Filter(400, 'bandpass');
    const gain = new Tone.Gain(0);
    const lfo = new Tone.LFO({ frequency: 0.05, min: -30, max: -8 });

    noise.connect(filter);
    filter.connect(gain);
    gain.toDestination();
    lfo.connect(gain.gain);

    let running = false;

    return {
      start() {
        if (running) return;
        noise.start();
        lfo.start();
        running = true;
      },
      stop() {
        noise.stop();
        lfo.stop();
        running = false;
      },
      setIntensity(v: number) {
        // v: 0..1
        gain.gain.rampTo(v * 0.4, 1.5);
        filter.frequency.rampTo(200 + v * 600, 2);
      },
    };
  }

  // Synthesize a brief branch-snap transient
  static playBranchSnap(panValue: number = 0, volumeDb: number = -18): void {
    const panner = new Tone.Panner(panValue);
    const filter = new Tone.Filter(1200, 'highpass');
    const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 });
    const gainNode = new Tone.Gain(Tone.dbToGain(volumeDb));
    const noise = new Tone.Noise('brown');

    noise.connect(filter);
    filter.connect(env);
    env.connect(gainNode);
    gainNode.connect(panner);
    panner.toDestination();

    noise.start();
    env.triggerAttackRelease(0.15);

    setTimeout(() => {
      noise.stop();
      noise.dispose();
      filter.dispose();
      env.dispose();
      gainNode.dispose();
      panner.dispose();
    }, 600);
  }

  // Synthesize a soft leaf rustle
  static playLeafRustle(panValue: number = 0, volume: number = -12): void {
    const panner = new Tone.Panner(panValue);
    const filter = new Tone.Filter(3000, 'bandpass');
    const gain = new Tone.Gain(Tone.dbToGain(volume));
    const env = new Tone.AmplitudeEnvelope({ attack: 0.05, decay: 0.4, sustain: 0, release: 0.3 });
    const noise = new Tone.Noise('white');

    noise.connect(filter);
    filter.connect(env);
    env.connect(gain);
    gain.connect(panner);
    panner.toDestination();

    noise.start();
    env.triggerAttackRelease(0.6);

    setTimeout(() => {
      noise.stop();
      noise.dispose();
      filter.dispose();
      env.dispose();
      gain.dispose();
      panner.dispose();
    }, 1500);
  }

  // Forest floor footstep — layered crunch with optional twig crack.
  // crunch: bandpass white noise (leaf/debris) + lowpass brown noise (foot weight)
  // crack:  highpass white noise (twig snap), fires ~20% of player steps, ~30% pursuer
  static playForestStep(panValue: number = 0, volumeDb: number = -20, withCrack: boolean = false): void {
    const panner = new Tone.Panner(panValue);
    panner.toDestination();

    // Crunch layer — the main lettuce-tear character
    const crunchFreq = 900 + Math.random() * 600;  // vary each step
    const crunchNoise = new Tone.Noise('white');
    const crunchFilter = new Tone.Filter(crunchFreq, 'bandpass');
    (crunchFilter as unknown as { Q: { value: number } }).Q.value = 4;
    const crunchEnv = new Tone.AmplitudeEnvelope({
      attack: 0.001, decay: 0.05 + Math.random() * 0.025, sustain: 0, release: 0.018,
    });
    const crunchGain = new Tone.Gain(Tone.dbToGain(volumeDb));
    crunchNoise.connect(crunchFilter);
    crunchFilter.connect(crunchEnv);
    crunchEnv.connect(crunchGain);
    crunchGain.connect(panner);
    crunchNoise.start();
    crunchEnv.triggerAttackRelease(0.07);

    // Weight layer — low thud of foot pressing down
    const weightNoise = new Tone.Noise('brown');
    const weightFilter = new Tone.Filter(260, 'lowpass');
    const weightEnv = new Tone.AmplitudeEnvelope({
      attack: 0.001, decay: 0.035, sustain: 0, release: 0.01,
    });
    const weightGain = new Tone.Gain(Tone.dbToGain(volumeDb - 3));
    weightNoise.connect(weightFilter);
    weightFilter.connect(weightEnv);
    weightEnv.connect(weightGain);
    weightGain.connect(panner);
    weightNoise.start();
    weightEnv.triggerAttackRelease(0.04);

    // Optional crack — sharp twig snap on top
    if (withCrack) {
      const crackNoise = new Tone.Noise('white');
      const crackFilter = new Tone.Filter(3500 + Math.random() * 1200, 'highpass');
      const crackEnv = new Tone.AmplitudeEnvelope({
        attack: 0.0005, decay: 0.016 + Math.random() * 0.012, sustain: 0, release: 0.008,
      });
      const crackGain = new Tone.Gain(Tone.dbToGain(volumeDb + 2));
      crackNoise.connect(crackFilter);
      crackFilter.connect(crackEnv);
      crackEnv.connect(crackGain);
      crackGain.connect(panner);
      crackNoise.start();
      crackEnv.triggerAttackRelease(0.025);

      setTimeout(() => {
        crackNoise.stop(); crackNoise.dispose();
        crackFilter.dispose(); crackEnv.dispose(); crackGain.dispose();
      }, 300);
    }

    setTimeout(() => {
      crunchNoise.stop(); crunchNoise.dispose();
      crunchFilter.dispose(); crunchEnv.dispose(); crunchGain.dispose();
      weightNoise.stop(); weightNoise.dispose();
      weightFilter.dispose(); weightEnv.dispose(); weightGain.dispose();
      panner.dispose();
    }, 400);
  }

  // Destination chime — bell-like tone
  static createDestinationBeacon(): { start: () => void; stop: () => void; setDistance: (d: number) => void } {
    const synth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 3.0, release: 4.0 },
      harmonicity: 3.1,
      modulationIndex: 16,
      resonance: 4000,
      octaves: 1.5,
    });
    synth.frequency.value = 220;
    const reverb = new Tone.Reverb({ decay: 6, wet: 0.8 });
    const gain = new Tone.Gain(0.12);
    const panner = new Tone.Panner(0);

    synth.connect(reverb);
    reverb.connect(gain);
    gain.connect(panner);
    panner.toDestination();

    let loop: Tone.Loop | null = null;

    return {
      start() {
        loop = new Tone.Loop((time: number) => {
          synth.triggerAttackRelease('C3', '8n', time);
        }, '8n').start(0);
        Tone.getTransport().start();
      },
      stop() {
        loop?.stop();
        loop?.dispose();
        Tone.getTransport().stop();
      },
      setDistance(d: number) {
        // d: 0 (close) .. 1 (far)
        const vol = -6 - d * 28;
        gain.gain.rampTo(Tone.dbToGain(vol), 0.5);
        // Pan slightly based on relative angle — caller can update
      },
    };
  }

  // Breath — layered noise shaped into exhale rhythm
  static createBreathLayer(): {
    start: () => void;
    stop: () => void;
    setLoad: (load: number) => void;
  } {
    const noise = new Tone.Noise('pink');
    const filter = new Tone.Filter(600, 'bandpass');
    const gain = new Tone.Gain(0.0);
    const lfo = new Tone.LFO({ frequency: 0.25, min: 0, max: 1 });
    const lfoGain = new Tone.Gain(0);

    noise.connect(filter);
    filter.connect(gain);
    // Modulate gain with lfo for breath rhythm
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    gain.toDestination();

    let running = false;

    return {
      start() {
        if (running) return;
        noise.start();
        lfo.start();
        running = true;
      },
      stop() {
        noise.stop();
        lfo.stop();
        running = false;
      },
      setLoad(load: number) {
        // load: 0..1
        const breathRate = 0.18 + load * 0.55;  // breaths per second
        lfo.frequency.rampTo(breathRate, 1.0);
        lfoGain.gain.rampTo(load * 0.18, 0.8);
        filter.frequency.rampTo(400 + load * 400, 1.0);
      },
    };
  }
}
