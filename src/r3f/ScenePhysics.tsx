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

  if (!physicsSystemRef.current) {
    physicsSystemRef.current = new PhysicsSystem();
  }

  useEffect(() => {
    physicsSystemRef.current?.configure(config);
  }, [config]);

  useFrame(() => {
    if (!physicsSystemRef.current || config?.enabled === false) return;
    const actors: PhysicsRuntimeActor[] = [];
    if (visitor) {
      actors.push({ id: 'visitor', object: visitor, radius: 0.55 });
    }
    for (const [id, entry] of actorRefs.current.entries()) {
      actors.push({
        id,
        object: entry.object,
        radius: entry.radius
      });
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
