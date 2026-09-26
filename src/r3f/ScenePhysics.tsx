import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Object3D, Vector3Tuple } from 'three';
import Visitor from '../modules/Visitor.js';
import { PhysicsSystem, type PhysicsCollisionEvent, type PhysicsConfig, type PhysicsRuntimeActor } from '../modules/physicsSystem';

export type DynamicActorRefs = MutableRefObject<Map<string, { object: Object3D; radius: number }>>;

export function ScenePhysics({
  config,
  visitor,
  actorRefs,
  onCollision
}: {
  config?: PhysicsConfig;
  visitor: Visitor | null;
  actorRefs: DynamicActorRefs;
  onCollision?: (event: {
    a: string;
    b: string;
    point: Vector3Tuple;
    penetration: number;
    timestamp: number;
  }) => void;
}) {
  const physicsSystemRef = useRef<PhysicsSystem | null>(null);
  const actorsRef = useRef<PhysicsRuntimeActor[]>([]);
  const actorCacheRef = useRef<Map<string, PhysicsRuntimeActor>>(new Map());

  if (!physicsSystemRef.current) {
    physicsSystemRef.current = new PhysicsSystem();
  }

  useEffect(() => {
    physicsSystemRef.current?.configure(config);
  }, [config]);

  useFrame(() => {
    if (!physicsSystemRef.current || config?.enabled === false) return;
    const actors = actorsRef.current;
    actors.length = 0;
    if (visitor) {
      let visitorActor = actorCacheRef.current.get('visitor');
      if (!visitorActor) {
        visitorActor = { id: 'visitor', object: visitor, radius: 0.55 };
        actorCacheRef.current.set('visitor', visitorActor);
      } else {
        visitorActor.object = visitor;
      }
      actors.push(visitorActor);
    }
    for (const [id, entry] of actorRefs.current.entries()) {
      let actor = actorCacheRef.current.get(id);
      if (!actor) {
        actor = { id, object: entry.object, radius: entry.radius };
        actorCacheRef.current.set(id, actor);
      } else {
        actor.object = entry.object;
        actor.radius = entry.radius;
      }
      actors.push(actor);
    }
    for (const id of actorCacheRef.current.keys()) {
      if (id !== 'visitor' && !actorRefs.current.has(id)) actorCacheRef.current.delete(id);
    }
    const collisions = physicsSystemRef.current.step(config, actors);
    if (onCollision && collisions.length > 0) {
      const timestamp = Date.now();
      collisions.forEach((entry: PhysicsCollisionEvent) => {
        onCollision({
          a: entry.a,
          b: entry.b,
          point: [entry.point.x, entry.point.y, entry.point.z],
          penetration: entry.penetration,
          timestamp
        });
      });
    }
  });

  return null;
}
