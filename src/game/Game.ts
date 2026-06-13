import { Engine, Scene, Vector3 } from '@babylonjs/core';
import type { GameConfig, ExperienceProfile, RunProfile, PursuerState } from '../types';

export interface GameDebugState {
  pursuerState: PursuerState;
  pursuerDistance: number;
  pursuerAggression: number;
  playerSpeed: number;
  breathLoad: number;
  adrenaline: number;
  destDistance: number;
  lightLevel: number;
  windIntensity: number;
}

export interface GameControls {
  setBellMultiplier: (v: number) => void;
  setWindOverride: (v: number | null) => void;
  setPursuerAudioMuted: (muted: boolean) => void;
  setBreathAudioMuted: (muted: boolean) => void;
  setWatcherEnabled: (enabled: boolean) => void;
  forceSpawnEyes: () => void;
}
import { EXPERIENCE_PROFILES } from '../config/experienceProfiles';
import { RUN_PROFILES } from '../config/runProfiles';
import { SceneFactory } from './SceneFactory';
import { GameLoop } from './GameLoop';
import { PlayerController } from '../player/PlayerController';
import { ForestGenerator } from '../world/ForestGenerator';
import { DaylightSystem } from '../world/DaylightSystem';
import { WeatherSystem } from '../world/WeatherSystem';
import { DestinationSystem } from '../world/DestinationSystem';
import { PursuerSystem } from '../pursuer/PursuerSystem';
import { PursuerAudio } from '../pursuer/PursuerAudio';
import { AmbientAudio } from '../audio/AmbientAudio';
import { PlayerAudio } from '../audio/PlayerAudio';
import { AudioEngine } from '../audio/AudioEngine';
import { WatcherEffect } from '../world/WatcherEffect';

const START_POS = new Vector3(0, 1.7, 0);
// ~235 units away — at jog speed ~35-40s in open air, ~3-4 min through the forest
const DEST_POS = new Vector3(190, 0, 140);

export class Game {
  private engine: Engine;
  private scene: Scene;
  private loop: GameLoop;
  private player: PlayerController;
  private forest: ForestGenerator;
  private daylight: DaylightSystem;
  private weather: WeatherSystem;
  private destination: DestinationSystem;
  private pursuer: PursuerSystem;
  private pursuerAudio: PursuerAudio;
  private ambientAudio: AmbientAudio;
  private playerAudio: PlayerAudio;
  private watcher: WatcherEffect;

  private expProfile: ExperienceProfile;
  private runProfile: RunProfile;

  private pursuerPos = { x: -50, z: -120 };

  // Catch feedback state
  private isCaught = false;
  private catchFadeEl: HTMLElement | null = null;

  // Win state
  private hasWon = false;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.expProfile = EXPERIENCE_PROFILES[config.experienceMode];
    this.runProfile = RUN_PROFILES[config.departureTime];

    const { engine, scene } = SceneFactory.create(canvas, this.expProfile, this.runProfile);
    this.engine = engine;
    this.scene = scene;

    this.player = new PlayerController(scene, START_POS.clone());

    this.forest = new ForestGenerator();
    this.forest.generate(scene, this.expProfile, DEST_POS);

    this.daylight = new DaylightSystem(scene, this.runProfile, this.expProfile);
    this.weather = new WeatherSystem(scene);
    this.weather.setMode('clear');

    this.destination = new DestinationSystem(DEST_POS);
    this.pursuer = new PursuerSystem();
    this.pursuerAudio = new PursuerAudio();
    this.ambientAudio = new AmbientAudio();
    this.playerAudio = new PlayerAudio();
    this.watcher = new WatcherEffect(scene, config.experienceMode);

    this.catchFadeEl = this.createFadeOverlay();

    this.loop = new GameLoop(engine, (dt) => this.tick(dt));
  }

  async start(): Promise<void> {
    await AudioEngine.start();
    this.ambientAudio.start();
    this.playerAudio.start();
    this.destination.start();

    // Introduce wind after 30s
    setTimeout(() => {
      this.weather.setMode('windy');
    }, 30_000);

    this.loop.start();
  }

  private tick(dt: number): void {
    if (this.isCaught || this.hasWon) return;

    // Player
    this.player.update(dt);
    const playerPos = this.player.getPosition();
    const speed = this.player.getSpeed();

    // Pursuer
    this.pursuer.update(dt, speed, { x: playerPos.x, z: playerPos.z }, this.pursuerPos);
    const pursuerModel = this.pursuer.getModel();
    this.player.adrenaline.update(dt, pursuerModel.state);

    // Pursuer audio panning — angle from player forward
    const camYaw = this.player.camera.rotation.y;
    const dpx = this.pursuerPos.x - playerPos.x;
    const dpz = this.pursuerPos.z - playerPos.z;
    const angleToP = Math.atan2(dpx, dpz);
    const relAngle = angleToP - camYaw;
    const pan = Math.max(-1, Math.min(1, Math.sin(relAngle)));

    const weatherMask = this.weather.getMaskLevel();
    this.pursuerAudio.update(dt, pan, pursuerModel.state, weatherMask);

    this.watcher.update(
      dt,
      playerPos,
      camYaw,
      this.pursuerPos,
      pursuerModel.state,
      () => this.player.adrenaline.spike(0.22),
    );

    // Daylight
    this.daylight.update(dt, this.runProfile, this.expProfile);
    this.ambientAudio.setNightLevel(this.daylight.getNightLevel());

    // Weather
    this.weather.update(dt, this.ambientAudio);

    // Fog
    SceneFactory.updateFog(
      this.scene,
      this.expProfile.fogDensity,
      this.daylight.getLightLevel(),
      weatherMask,
    );

    // Destination
    this.destination.update(playerPos);
    if (this.destination.isReached()) {
      this.triggerWin();
      return;
    }

    // Player audio
    this.playerAudio.updateBreath(this.player.breath.getLoad());
    this.playerAudio.updateFootsteps(speed);

    // Catch check
    if (pursuerModel.state === 'caught') {
      this.triggerCatch();
      return;
    }

    this.scene.render();
  }

  private triggerCatch(): void {
    this.isCaught = true;

    // Play catch sound — a brief distorted snap
    AudioEngine.playBranchSnap(0, 0);

    // Fade to black then restart
    this.fadeOut(800).then(() => {
      this.restart();
    });
  }

  private triggerWin(): void {
    this.hasWon = true;
    this.destination.stop();

    this.fadeOut(3000).then(() => {
      this.showWinText();
    });
  }

  private restart(): void {
    // Reset player
    this.player.reset(START_POS.clone());

    // Reset pursuer to start position
    this.pursuerPos = { x: -50, z: -120 };
    this.pursuer.reset();
    this.destination.reset();
    this.destination.start();

    this.isCaught = false;
    this.hasWon = false;

    // Fade back in
    this.fadeIn(1200);
  }

  private createFadeOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; inset: 0; background: #000;
      opacity: 0; pointer-events: none;
      transition: none; z-index: 100;
    `;
    document.body.appendChild(el);
    return el;
  }

  private fadeOut(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.catchFadeEl) { resolve(); return; }
      this.catchFadeEl.style.transition = `opacity ${ms}ms ease-in`;
      this.catchFadeEl.style.opacity = '1';
      setTimeout(resolve, ms);
    });
  }

  private fadeIn(ms: number): void {
    if (!this.catchFadeEl) return;
    this.catchFadeEl.style.transition = `opacity ${ms}ms ease-out`;
    this.catchFadeEl.style.opacity = '0';
  }

  private showWinText(): void {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; inset: 0; display: flex; align-items: center;
      justify-content: center; background: #000; z-index: 200;
    `;
    el.innerHTML = `<p style="color:#888;font-family:monospace;font-size:1.1rem;letter-spacing:0.2em;text-align:center;line-height:2em">
      you made it<br><br>
      <span style="font-size:0.7rem;color:#444">press F5 to go again</span>
    </p>`;
    document.body.appendChild(el);
  }

  getDebugState(): GameDebugState {
    const m = this.pursuer.getModel();
    const pp = this.player.getPosition();
    return {
      pursuerState: m.state,
      pursuerDistance: m.distance,
      pursuerAggression: m.aggression,
      playerSpeed: this.player.getSpeed(),
      breathLoad: this.player.breath.getLoad(),
      adrenaline: this.player.adrenaline.getLevel(),
      destDistance: this.destination.getDistance(pp),
      lightLevel: this.daylight.getLightLevel(),
      windIntensity: this.weather.getMaskLevel(),
    };
  }

  getControls(): GameControls {
    return {
      setBellMultiplier: (v) => this.destination.setGainMultiplier(v),
      setWindOverride: (v) => this.weather.setWindOverride(v),
      setPursuerAudioMuted: (muted) => this.pursuerAudio.setMuted(muted),
      setBreathAudioMuted: (muted) => this.playerAudio.setBreathMuted(muted),
      setWatcherEnabled: (enabled) => this.watcher.setEnabled(enabled),
      forceSpawnEyes: () => this.watcher.forceSpawn(this.pursuerPos),
    };
  }

  dispose(): void {
    this.loop.stop();
    this.destination.dispose();
    this.ambientAudio.stop();
    this.playerAudio.dispose();
    this.watcher.dispose();
    this.forest.dispose();
    this.engine.dispose();
    this.catchFadeEl?.remove();
  }
}
