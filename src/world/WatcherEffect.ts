import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
} from '@babylonjs/core';
import type { PursuerState, ExperienceMode } from '../types';

// Max angle from the pursuer direction that still counts as "looking at it"
const LOOK_ANGLE_RAD = 0.6; // ~34 degrees

export class WatcherEffect {
  private scene: Scene;
  private mode: ExperienceMode;
  private cooldown = 6.0;
  private activePairs: Mesh[][] = [];
  private enabled = true;

  constructor(scene: Scene, mode: ExperienceMode) {
    this.scene = scene;
    this.mode = mode;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Reset cooldown so eyes can appear quickly when re-enabled for study
    if (enabled) this.cooldown = 0.5;
  }

  // Force-spawn eyes at the pursuer position immediately — for dev study
  forceSpawn(pursuerPos: { x: number; z: number }, state: PursuerState = 'close'): void {
    this.spawnEyes(pursuerPos, state);
  }

  update(
    dt: number,
    playerPos: Vector3,
    playerYaw: number,
    pursuerPos: { x: number; z: number },
    pursuerState: PursuerState,
    onAdrenalineSpike: () => void,
  ): void {
    if (!this.enabled) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (pursuerState === 'far' || pursuerState === 'caught') return;

    // Is the player looking toward the pursuer?
    const dpx = pursuerPos.x - playerPos.x;
    const dpz = pursuerPos.z - playerPos.z;
    const angleToPursuer = Math.atan2(dpx, dpz);
    let rel = angleToPursuer - playerYaw;
    while (rel > Math.PI)  rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;

    if (Math.abs(rel) > LOOK_ANGLE_RAD) return;

    this.spawnEyes(pursuerPos, pursuerState);
    onAdrenalineSpike();

    // Longer cooldown when pursuer is near (rarer glimpses = more unnerving)
    this.cooldown = pursuerState === 'close'
      ? 7  + Math.random() * 9
      : 14 + Math.random() * 16;
  }

  private spawnEyes(pursuerPos: { x: number; z: number }, state: PursuerState): void {
    // Offset eyes slightly so they peek from "behind" a tree
    const offsetX = (Math.random() - 0.5) * 2.0;
    const offsetZ = (Math.random() - 0.5) * 2.0;
    const eyeY    = 1.52 + Math.random() * 0.35;

    // Color: amber-orange in PS1 (warm, animal), pale ice-blue in RADIO (cold, wrong)
    const glowColor = this.mode === 'ps1'
      ? new Color3(1.0, 0.55 + Math.random() * 0.15, 0.05)
      : new Color3(0.72, 0.88, 1.0);

    const eyeSeparation = 0.16;
    const pair: Mesh[] = [];

    for (let i = 0; i < 2; i++) {
      const eye = MeshBuilder.CreateSphere(
        `eye_${Date.now()}_${i}`,
        { diameter: 0.09, segments: 4 },
        this.scene,
      );
      const mat = new StandardMaterial(`eyeMat_${Date.now()}_${i}`, this.scene);
      mat.emissiveColor = glowColor;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      eye.material = mat;
      eye.position.set(
        pursuerPos.x + offsetX + (i - 0.5) * eyeSeparation * 2,
        eyeY,
        pursuerPos.z + offsetZ,
      );
      pair.push(eye);
    }

    this.activePairs.push(pair);

    // How long eyes linger before reacting — close = shorter, more startling
    const showMs = state === 'close'
      ? 180 + Math.random() * 180
      : 280 + Math.random() * 320;

    const dartOrBlink = Math.random() < 0.6 ? 'dart' : 'blink';

    setTimeout(() => {
      if (dartOrBlink === 'dart') {
        // Snap to a nearby position, then vanish — implies fast movement
        const dartX = (Math.random() - 0.5) * 3.5;
        const dartZ = (Math.random() - 0.5) * 3.5;
        pair.forEach((eye) => {
          eye.position.x += dartX;
          eye.position.z += dartZ;
        });
        setTimeout(() => this.disposePair(pair), 80);
      } else {
        // Blink — instant cut to nothing
        this.disposePair(pair);
      }
    }, showMs);
  }

  private disposePair(pair: Mesh[]): void {
    pair.forEach((eye) => {
      eye.dispose();
    });
    const idx = this.activePairs.indexOf(pair);
    if (idx >= 0) this.activePairs.splice(idx, 1);
  }

  dispose(): void {
    this.activePairs.forEach((pair) => pair.forEach((m) => m.dispose()));
    this.activePairs = [];
  }
}
