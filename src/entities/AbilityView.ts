import Phaser from 'phaser';
import { ATLAS_KEY } from '@/art/animations';
import type { AbilityEffect, EffectKind } from '@/sim/abilities';

/**
 * Draws whatever the ability system says is running.
 *
 * One sprite per effect kind, created up front and shown or hidden — only one
 * ability can run at a time, so there is nothing to pool.
 *
 * The original built these out of scene2d `Action` chains parented to the
 * runner: fades, spins and `MoveToAction`s. The motion itself now lives in the
 * simulation, where it can be tested, and this only reflects it.
 */

const EFFECT_DEPTH = 55;

export class AbilityView {
  private readonly sprites = new Map<EffectKind, Phaser.GameObjects.Sprite>();
  private readonly clockHand: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    const make = (frame: string): Phaser.GameObjects.Sprite =>
      scene.add
        .sprite(0, 0, ATLAS_KEY, frame)
        .setOrigin(0.5, 0.5)
        .setDepth(EFFECT_DEPTH)
        .setVisible(false);

    this.sprites.set('sweep', make('p-sparks'));
    this.sprites.set('charge', make('carrot_run_01'));
    this.sprites.set('clock', make('clock_face'));
    this.sprites.set('hole', make('blackhole_01'));

    // The hand is a separate piece so it can spin independently of the face.
    this.clockHand = scene.add
      .image(0, 0, ATLAS_KEY, 'clock_hand')
      // Pivot at the bottom of the hand, the way a clock hand turns.
      .setOrigin(0.5, 1)
      .setDepth(EFFECT_DEPTH + 1)
      .setVisible(false);
  }

  update(effects: readonly AbilityEffect[], time: number): void {
    for (const sprite of this.sprites.values()) sprite.setVisible(false);
    this.clockHand.setVisible(false);

    for (const effect of effects) {
      const sprite = this.sprites.get(effect.kind);
      if (sprite === undefined) continue;

      // Sim is Y-up, Phaser is Y-down.
      sprite.setPosition(effect.x, -effect.y).setVisible(true);

      switch (effect.kind) {
        case 'sweep': {
          // A quick outward flash that fades as the swing finishes.
          sprite.setScale(0.6 + effect.progress * 1.4);
          sprite.setAlpha(1 - effect.progress);
          sprite.setAngle(effect.progress * 180);
          break;
        }
        case 'charge': {
          sprite.setScale(0.62);
          sprite.setAlpha(1);
          sprite.play('carrot_run', true);
          break;
        }
        case 'clock': {
          sprite.setScale(1);
          // Fade in over the first half, out over the second, as the original's
          // forever(sequence(fadeIn, fadeOut)) did.
          sprite.setAlpha(
            effect.progress < 0.5 ? effect.progress * 2 : (1 - effect.progress) * 2,
          );
          this.clockHand
            .setPosition(effect.x, -effect.y)
            .setVisible(true)
            .setAlpha(sprite.alpha)
            // One full turn across the ability, matching the original.
            .setRotation(effect.progress * Math.PI * 2);
          break;
        }
        case 'hole': {
          sprite.play('blackhole', true);
          // Swell then collapse.
          const swell = Math.sin(effect.progress * Math.PI);
          sprite.setScale(0.4 + swell * 1.6);
          sprite.setAlpha(swell);
          sprite.setRotation((time / 1000) * 2);
          break;
        }
      }
    }
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.clockHand.destroy();
  }
}
