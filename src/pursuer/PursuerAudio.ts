import { AudioEngine } from '../audio/AudioEngine';
import type { PursuerState } from '../types';

export class PursuerAudio {
  private footstepTimer = 0;
  private rustleTimer = 0;
  private snapTimer = 0;
  private muted = false;

  setMuted(muted: boolean): void { this.muted = muted; }

  update(dt: number, pursuerAngle: number, state: PursuerState, weatherMask: number): void {
    if (this.muted || state === 'caught') return;
    if (state === 'far')   this.updateFar(dt, pursuerAngle, weatherMask);
    if (state === 'near')  this.updateNear(dt, pursuerAngle, weatherMask);
    if (state === 'close') this.updateClose(dt, pursuerAngle, weatherMask);
  }

  private updateFar(dt: number, pan: number, mask: number): void {
    // Just occasional very distant snaps — barely there
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 10 + Math.random() * 14;
      if (Math.random() > mask * 0.8) {
        AudioEngine.playBranchSnap(pan, -40 + Math.random() * 5);
      }
    }
  }

  private updateNear(dt: number, pan: number, mask: number): void {
    // Audible footsteps — crunch with occasional crack, panned to pursuer direction
    this.footstepTimer -= dt;
    if (this.footstepTimer <= 0) {
      this.footstepTimer = 0.85 + Math.random() * 0.55;
      if (Math.random() > mask * 0.5) {
        const vol = -24 + Math.random() * 3;
        const crack = Math.random() < 0.28;
        AudioEngine.playForestStep(pan, vol, crack);
      }
    }

    // Occasional leaf rustle between steps
    this.rustleTimer -= dt;
    if (this.rustleTimer <= 0) {
      this.rustleTimer = 2.8 + Math.random() * 3.5;
      if (Math.random() > mask * 0.4) {
        AudioEngine.playLeafRustle(pan, -22 + Math.random() * 4);
      }
    }
  }

  private updateClose(dt: number, pan: number, mask: number): void {
    // Rapid, loud footsteps — unmistakably something closing in
    this.footstepTimer -= dt;
    if (this.footstepTimer <= 0) {
      this.footstepTimer = 0.4 + Math.random() * 0.22;
      if (Math.random() > mask * 0.25) {
        // Close steps are heavier — slightly lower crunch freq, louder
        const vol = -8 + Math.random() * 3;
        const crack = Math.random() < 0.35;  // more cracks — aggressive movement
        AudioEngine.playForestStep(pan, vol, crack);
      }
    }

    // Brush through leaves
    this.rustleTimer -= dt;
    if (this.rustleTimer <= 0) {
      this.rustleTimer = 0.7 + Math.random() * 0.9;
      if (Math.random() > mask * 0.2) {
        AudioEngine.playLeafRustle(pan, -7 + Math.random() * 3);
      }
    }

    // Branch snaps — something large moving fast
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 1.4 + Math.random() * 1.8;
      if (Math.random() > mask * 0.2) {
        AudioEngine.playBranchSnap(pan, -5 + Math.random() * 3);
      }
    }
  }
}
