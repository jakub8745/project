import { Vector3, Raycaster, Matrix3 } from 'three';

function clampNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export default class Robot {
  constructor(params = {}) {
    this.name = 'robot';
    this.speed = clampNumber(params.speed, 0.6);
    this.swayAngle = clampNumber(params.swayAngle, 0.04);
    this.swaySpeed = clampNumber(params.swaySpeed, 2.5);
    this.bobDistance = clampNumber(params.bobDistance, 0.03);
    this.bobSpeed = clampNumber(params.bobSpeed, 0.45);
    this.turnJitter = clampNumber(params.turnJitter, 0.45);
    this.lookAhead = clampNumber(params.lookAhead, 1.4);
    this.collisionRadius = clampNumber(params.collisionRadius, 0.9);
    this.avoidDistance = clampNumber(params.avoidDistance, 1.4);
    this.boundaryPadding = clampNumber(params.boundaryPadding, 1.0);
    this.basePosition = (params.basePosition || new Vector3()).clone();
    this.baseRotation = (params.baseRotation || new Vector3()).clone();
    this.time = 0;

    const initialDirection = params.direction || [1, 0];
    const dx = clampNumber(initialDirection[0], 1);
    const dz = clampNumber(initialDirection[1], 0);
    this.direction = new Vector3(dx, 0, dz);
    if (this.direction.lengthSq() < 1e-6) {
      this.direction.set(1, 0, 0);
    }
    this.direction.normalize();

    this.target = null;
    this.raycaster = new Raycaster();
    this.worldNormalMatrix = new Matrix3();
    this.tempNormal = new Vector3();
    this.tempDirection = new Vector3();
    this.tempPosition = new Vector3();
  }

  attach(target) {
    this.target = target;
    if (!this.target) return;
    this.target.position.copy(this.basePosition);
  }

  setDirectionFromVector(vector) {
    this.direction.set(vector.x, 0, vector.z);
    if (this.direction.lengthSq() < 1e-6) return;
    this.direction.normalize();
  }

  _applyJitterTurn() {
    const jitter = (Math.random() * 2 - 1) * this.turnJitter;
    const cos = Math.cos(jitter);
    const sin = Math.sin(jitter);
    const x = this.direction.x;
    const z = this.direction.z;
    this.direction.x = x * cos - z * sin;
    this.direction.z = x * sin + z * cos;
    this.direction.normalize();
  }

  _avoidPoint(point, distance) {
    if (!this.target) return false;
    this.tempPosition.copy(this.target.position).setY(0);
    const targetPoint = this.tempDirection.copy(point).setY(0);
    const currentDistance = this.tempPosition.distanceTo(targetPoint);
    if (currentDistance > distance) return false;
    this.tempDirection.subVectors(this.tempPosition, targetPoint);
    if (this.tempDirection.lengthSq() < 1e-6) {
      this.tempDirection.set(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
    }
    this.setDirectionFromVector(this.tempDirection);
    this._applyJitterTurn();
    return true;
  }

  _resolveColliderCollision(collider) {
    if (!this.target || !collider) return false;
    const origin = this.tempPosition.copy(this.target.position);
    origin.y += 0.65;
    this.raycaster.firstHitOnly = true;
    this.raycaster.far = this.lookAhead;
    this.raycaster.set(origin, this.direction);
    const hits = this.raycaster.intersectObject(collider, true);
    const hit = hits[0];
    if (!hit || hit.distance > this.lookAhead) return false;

    if (hit.face) {
      this.worldNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
      this.tempNormal.copy(hit.face.normal).applyMatrix3(this.worldNormalMatrix).normalize();
      if (this.tempNormal.lengthSq() > 1e-6) {
        this.direction.reflect(this.tempNormal).normalize();
      } else {
        this.direction.multiplyScalar(-1);
      }
    } else {
      this.direction.multiplyScalar(-1);
    }
    this._applyJitterTurn();
    return true;
  }

  update(delta, context = {}) {
    if (!this.target) return;
    this.time += delta;

    const {
      collider = null,
      visitor = null,
      obstacles = [],
      roomBounds = null
    } = context;

    if (visitor?.position) {
      this._avoidPoint(visitor.position, this.avoidDistance + this.collisionRadius);
    }

    for (const obstacle of obstacles) {
      if (!obstacle?.position) continue;
      const obstacleDistance = clampNumber(obstacle.radius, 0.8) + this.collisionRadius;
      if (this._avoidPoint(obstacle.position, obstacleDistance)) break;
    }

    this._resolveColliderCollision(collider);

    const movement = this.tempDirection.copy(this.direction).multiplyScalar(this.speed * delta);
    this.target.position.add(movement);

    if (roomBounds) {
      const minX = roomBounds.minX + this.boundaryPadding;
      const maxX = roomBounds.maxX - this.boundaryPadding;
      const minZ = roomBounds.minZ + this.boundaryPadding;
      const maxZ = roomBounds.maxZ - this.boundaryPadding;
      let bounced = false;

      if (this.target.position.x < minX || this.target.position.x > maxX) {
        this.target.position.x = Math.max(minX, Math.min(maxX, this.target.position.x));
        this.direction.x *= -1;
        bounced = true;
      }
      if (this.target.position.z < minZ || this.target.position.z > maxZ) {
        this.target.position.z = Math.max(minZ, Math.min(maxZ, this.target.position.z));
        this.direction.z *= -1;
        bounced = true;
      }
      if (bounced) {
        this.direction.normalize();
        this._applyJitterTurn();
      }
    }

    this.target.position.y = this.basePosition.y + Math.sin(this.time * this.bobSpeed) * this.bobDistance;
    this.target.rotation.x = this.baseRotation.x;
    this.target.rotation.y = this.baseRotation.y + Math.atan2(this.direction.x, this.direction.z);
    this.target.rotation.z = this.baseRotation.z + Math.sin(this.time * this.swaySpeed) * this.swayAngle;
  }
}
