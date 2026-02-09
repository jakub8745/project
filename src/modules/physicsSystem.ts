import { Object3D, Vector3 } from 'three';

export interface PhysicsActorRule {
  enabled?: boolean;
  radius?: number;
  mass?: number;
  pushable?: boolean;
}

export interface PhysicsPairRule {
  a: string;
  b: string;
  enabled?: boolean;
}

export interface PhysicsConfig {
  enabled?: boolean;
  iterations?: number;
  actors?: Record<string, PhysicsActorRule>;
  pairs?: PhysicsPairRule[];
}

export interface PhysicsRuntimeActor {
  id: string;
  object: Object3D;
  radius?: number;
  mass?: number;
  pushable?: boolean;
}

const EPSILON = 1e-6;

function getPairKey(a: string, b: string) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export class PhysicsSystem {
  private normal = new Vector3();
  private deltaPos = new Vector3();
  private fallback = new Vector3();
  private pairRules = new Map<string, boolean>();

  configure(config?: PhysicsConfig) {
    this.pairRules.clear();
    if (!config?.pairs) return;
    for (const pair of config.pairs) {
      if (!pair?.a || !pair?.b) continue;
      this.pairRules.set(getPairKey(pair.a, pair.b), pair.enabled !== false);
    }
  }

  private getActorRule(config: PhysicsConfig | undefined, actor: PhysicsRuntimeActor): Required<PhysicsActorRule> {
    const id = actor.id;
    const rule = config?.actors?.[id];
    return {
      enabled: rule?.enabled !== false,
      radius: typeof rule?.radius === 'number' && Number.isFinite(rule.radius)
        ? Math.max(0.05, rule.radius)
        : typeof actor.radius === 'number' && Number.isFinite(actor.radius)
          ? Math.max(0.05, actor.radius)
          : 0.75,
      mass: typeof rule?.mass === 'number' && Number.isFinite(rule.mass)
        ? Math.max(0.01, rule.mass)
        : typeof actor.mass === 'number' && Number.isFinite(actor.mass)
          ? Math.max(0.01, actor.mass)
          : 1,
      pushable: typeof rule?.pushable === 'boolean' ? rule.pushable : actor.pushable !== false
    };
  }

  private pairEnabled(config: PhysicsConfig | undefined, a: string, b: string) {
    const key = getPairKey(a, b);
    const explicit = this.pairRules.get(key);
    if (typeof explicit === 'boolean') return explicit;
    return true;
  }

  step(config: PhysicsConfig | undefined, actors: PhysicsRuntimeActor[]) {
    if (config?.enabled === false || actors.length < 2) return;
    const iterations = typeof config?.iterations === 'number' && Number.isFinite(config.iterations)
      ? Math.max(1, Math.min(8, Math.floor(config.iterations)))
      : 2;

    for (let iter = 0; iter < iterations; iter += 1) {
      for (let i = 0; i < actors.length; i += 1) {
        const a = actors[i];
        const aRule = this.getActorRule(config, a);
        if (!aRule.enabled) continue;
        for (let j = i + 1; j < actors.length; j += 1) {
          const b = actors[j];
          const bRule = this.getActorRule(config, b);
          if (!bRule.enabled) continue;
          if (!this.pairEnabled(config, a.id, b.id)) continue;

          this.deltaPos.subVectors(b.object.position, a.object.position);
          this.deltaPos.y = 0;
          const distSq = this.deltaPos.lengthSq();
          const minDist = aRule.radius + bRule.radius;
          const minDistSq = minDist * minDist;
          if (distSq >= minDistSq) continue;

          let dist = Math.sqrt(Math.max(distSq, EPSILON));
          if (dist < EPSILON) {
            this.fallback.set(Math.random() * 2 - 1, 0, Math.random() * 2 - 1).normalize();
            this.normal.copy(this.fallback);
            dist = 0;
          } else {
            this.normal.copy(this.deltaPos).multiplyScalar(1 / dist);
          }

          const penetration = minDist - dist;
          if (penetration <= 0) continue;

          const invMassA = aRule.pushable ? 1 / aRule.mass : 0;
          const invMassB = bRule.pushable ? 1 / bRule.mass : 0;
          const invMassSum = invMassA + invMassB;
          if (invMassSum <= EPSILON) continue;

          const moveA = penetration * (invMassA / invMassSum);
          const moveB = penetration * (invMassB / invMassSum);

          if (moveA > 0) {
            a.object.position.addScaledVector(this.normal, -moveA);
          }
          if (moveB > 0) {
            b.object.position.addScaledVector(this.normal, moveB);
          }
        }
      }
    }
  }
}
