// src/modules/Visitor.js
import {
  Mesh,
  Line3,
  Vector3,
  Vector2,
  Quaternion,
  Box3,
  Matrix4,
  Matrix3,
  Scene,
  MeshStandardMaterial,
  AudioListener,
  Raycaster

} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import rotateOrbit from './rotateOrbit.js';


export default class Visitor extends Mesh {
  constructor(deps) {
    const geometry = new RoundedBoxGeometry(0.2, 0.2, 0.2, 2, 0.2);
    const material = new MeshStandardMaterial();
    super(geometry, material);

    this.name = 'visitor';
    this.visible = false;
    this.material.wireframe = true;
    this.castShadow = false;

    this.mainScene = new Scene();
    this.deps = deps;
    this.camera = deps.camera;
    this.controls = deps.controls;
    this.params = deps.params;
    this.renderer = deps.renderer;
    this.xrRig = deps.xrRig || null;

    this.visitorVelocity = new Vector3();
    this.horizontalVelocity = new Vector3();
    this.desiredVelocity = new Vector3();
    this.desiredMove = new Vector3();
    this.autoMoveDirection = new Vector3();
    this.visitorIsOnGround = true;
    this.verticalCollisionDetected = false;
    this.target = new Vector3(2, 10, 2);


    this.isAutoMoving = false;
    this.autoMoveSpeed = 5;
    this.autoMoveBlockedSeconds = 0;
    this.autoMoveLastDistance = Infinity;
    this.autoMoveWasActive = false;
    this.stuckSeconds = 0;
    this.lastSafePosition = new Vector3();
    this.hasLastSafePosition = false;
    this.lastCollisionCorrection = new Vector3();
    this.preCollisionPosition = new Vector3();
    this.collisionCorrectionMagnitude = 0;
    this.horizontalCollisionCorrection = 0;
    this.lastMovementProgress = 0;
    this.lastMovementAttempt = 0;
    this.horizontalStep = new Vector3();
    this.slideStepA = new Vector3();
    this.slideStepB = new Vector3();
    this.sweepHitNormal = new Vector3();
    this.sweepDirection = new Vector3();
    this.sweepOrigin = new Vector3();
    this.sweepNormalMatrix = new Matrix3();
    this.moveRaycaster = new Raycaster();
    this.moveRaycaster.firstHitOnly = true;
    this.sweepBlocked = false;
    this.clickIndicator = null;
    this.joystickVector = new Vector2(0, 0);

    this.capsuleInfo = {
      radius: 0.5,
      segment: new Line3(new Vector3(0, 0, 0), new Vector3(0, 0.5, 0))
    };

    this.fwdPressed = false;
    this.bkdPressed = false;
    this.lftPressed = false;
    this.rgtPressed = false;

    this.tempVector = new Vector3();
    this.tempVector2 = new Vector3();
    this.tempBox = new Box3();
    this.tempMat = new Matrix4();
    this.tempSegment = new Line3();
    this.upVector = new Vector3(0, 1, 0);

    this._keyDownHandler = null;
    this._keyUpHandler = null;
    this._blurHandler = null;
    this._visibilityChangeHandler = null;

    this._setupInput();
    deps.visitor = this;


  }

  _findEnterAnchor() {
    const root = this.parent;
    if (!root || typeof root.traverse !== 'function') {
      return null;
    }

    const preferredRoots = [];
    if (Array.isArray(root.children)) {
      const displayRoot = root.children.find((child) => child?.name === 'r3f-display-root');
      const proceduralRoot = root.children.find((child) => child?.name === 'r3f-procedural-room');
      if (displayRoot) {
        preferredRoots.push(displayRoot);
      }
      if (proceduralRoot && proceduralRoot !== displayRoot) {
        preferredRoots.push(proceduralRoot);
      }
    }

    const searchRoots = preferredRoots.length > 0 ? preferredRoots : [root];

    for (const searchRoot of searchRoots) {
      searchRoot.updateMatrixWorld?.(true);

      let enterAnchor = null;
      searchRoot.traverse((object) => {
        if (enterAnchor) return;
        const type = object?.userData?.type;
        if (typeof type === 'string' && type.toLowerCase() === 'enter') {
          enterAnchor = object;
        }
      });

      if (enterAnchor) {
        return enterAnchor;
      }
    }

    return null;
  }

  _resolveSpawnPosition() {
    return this._resolveSpawnPositionFromAnchor(this._findEnterAnchor());
  }

  _resolveSpawnPositionFromAnchor(enterAnchor) {
    if (enterAnchor) {
      const spawnPosition = new Vector3();
      enterAnchor.getWorldPosition(spawnPosition);
      return spawnPosition;
    }

    return this.params.visitorEnter ?? new Vector3(0, 10, 0);
  }

  _resolveLocalForwardAxis(anchor) {
    const userData = anchor?.userData;
    const axisValue =
      userData && typeof userData === 'object'
        ? userData.forwardAxis ?? userData.lookAxis ?? userData.directionAxis ?? userData.direction
        : undefined;

    const axis = this._coerceDirectionVector(axisValue);
    if (axis) return axis;

    // Blender single-arrow empties start along +Z, so that is the default forward axis.
    return new Vector3(0, 0, 1);
  }

  _coerceDirectionVector(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'x' || normalized === '+x' || normalized === 'east') return new Vector3(1, 0, 0);
      if (normalized === '-x' || normalized === 'west') return new Vector3(-1, 0, 0);
      if (normalized === 'y' || normalized === '+y' || normalized === 'up') return new Vector3(0, 1, 0);
      if (normalized === '-y' || normalized === 'down') return new Vector3(0, -1, 0);
      if (normalized === 'z' || normalized === '+z' || normalized === 'south') return new Vector3(0, 0, 1);
      if (normalized === '-z' || normalized === 'north') return new Vector3(0, 0, -1);
    }

    if (Array.isArray(value) && value.length === 3) {
      return new Vector3(
        Number(value[0]) || 0,
        Number(value[1]) || 0,
        Number(value[2]) || 0
      );
    }

    if (value && typeof value === 'object') {
      const vector = value;
      return new Vector3(
        Number(vector.x) || 0,
        Number(vector.y) || 0,
        Number(vector.z) || 0
      );
    }

    return null;
  }

  _resolveSpawnDirection(enterAnchor) {
    if (!enterAnchor) {
      const fallbackDirection = this._coerceDirectionVector(this.params.spawnDirection ?? this.params.visitorDirection);
      if (!fallbackDirection || fallbackDirection.lengthSq() < 1e-6) {
        return null;
      }
      fallbackDirection.y = 0;
      return fallbackDirection.lengthSq() >= 1e-6 ? fallbackDirection.normalize() : null;
    }

    const userData = enterAnchor.userData;
    const explicitWorldDirection =
      userData && typeof userData === 'object'
        ? this._coerceDirectionVector(userData.spawnDirection ?? userData.lookDirection ?? userData.worldDirection)
        : null;

    if (explicitWorldDirection && explicitWorldDirection.lengthSq() >= 1e-6) {
      explicitWorldDirection.y = 0;
      if (explicitWorldDirection.lengthSq() >= 1e-6) {
        return explicitWorldDirection.normalize();
      }
    }

    const localForward = this._resolveLocalForwardAxis(enterAnchor);
    if (localForward.lengthSq() < 1e-6) {
      return null;
    }

    const worldQuaternion = new Quaternion();
    enterAnchor.getWorldQuaternion(worldQuaternion);

    const worldForward = localForward.clone().applyQuaternion(worldQuaternion);
    worldForward.y = 0;
    if (worldForward.lengthSq() < 1e-6) {
      return null;
    }

    return worldForward.normalize();
  }

  _setupInput() {
    if (typeof window === 'undefined') return;
    const keyMap = {
      ArrowUp: 'fwdPressed',
      w: 'fwdPressed',
      ArrowDown: 'bkdPressed',
      s: 'bkdPressed',
      ArrowLeft: 'lftPressed',
      a: 'lftPressed',
      ArrowRight: 'rgtPressed',
      d: 'rgtPressed'
    };

    const isTypingTarget = (event) => {
      const target = event.target;
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      const role = target.getAttribute('role');
      if (role === 'textbox') return true;
      return false;
    };

    const shouldIgnoreForShortcut = (event) => event.metaKey || event.ctrlKey || event.altKey;

    this._keyDownHandler = (e) => {
      if (isTypingTarget(e)) {
        this.resetKeyboardInput();
        return;
      }
      if (shouldIgnoreForShortcut(e)) {
        this.resetKeyboardInput();
        return;
      }
      const movementKey = keyMap[e.key.toLowerCase()] ?? keyMap[e.key];
      if (movementKey !== undefined) {
        e.preventDefault(); 
        this[movementKey] = true;
      }
    };

    this._keyUpHandler = (e) => {
      if (isTypingTarget(e)) {
        this.resetKeyboardInput();
        return;
      }
      const movementKey = keyMap[e.key.toLowerCase()] ?? keyMap[e.key];
      if (movementKey !== undefined) {
        e.preventDefault(); 
        this[movementKey] = false;
      }
    };

    this._blurHandler = () => {
      this.resetKeyboardInput();
    };

    this._visibilityChangeHandler = () => {
      if (document.visibilityState !== 'visible') {
        this.resetKeyboardInput();
      }
    };

    window.addEventListener('keydown', this._keyDownHandler);
    window.addEventListener('keyup', this._keyUpHandler);
    window.addEventListener('blur', this._blurHandler);
    document.addEventListener('visibilitychange', this._visibilityChangeHandler);
  }

  resetKeyboardInput() {
    this.fwdPressed = false;
    this.bkdPressed = false;
    this.lftPressed = false;
    this.rgtPressed = false;
    this.desiredMove.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.horizontalVelocity.set(0, 0, 0);
  }

  dispose() {
    if (typeof window === 'undefined') return;
    if (this._keyDownHandler) {
      window.removeEventListener('keydown', this._keyDownHandler);
    }
    if (this._keyUpHandler) {
      window.removeEventListener('keyup', this._keyUpHandler);
    }
    if (this._blurHandler) {
      window.removeEventListener('blur', this._blurHandler);
    }
    if (this._visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
    }
    this._keyDownHandler = null;
    this._keyUpHandler = null;
    this._blurHandler = null;
    this._visibilityChangeHandler = null;
  }

  update(delta, collider) {
    const stepDelta = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 1 / 20) : 0;
    const startX = this.position.x;
    const startZ = this.position.z;

    if (this.visitorIsOnGround) {
      this.visitorVelocity.y = 0;
    } else {
      this.visitorVelocity.y += stepDelta * this.params.gravity;
    }

    const angle = this.controls.getAzimuthalAngle();
    const keyX = (this.rgtPressed ? 1 : 0) - (this.lftPressed ? 1 : 0);
    const keyZ = (this.bkdPressed ? 1 : 0) - (this.fwdPressed ? 1 : 0);
    this.desiredMove.set(
      keyX + this.joystickVector.x,
      0,
      keyZ - this.joystickVector.y
    );

    const hasManualInput = this.desiredMove.lengthSq() > 1e-4;
    let targetSpeed = this.params.visitorSpeed;
    if (hasManualInput) {
      this.isAutoMoving = false;
      if (this.clickIndicator) {
        this.clickIndicator.visible = false;
      }
      if (this.desiredMove.lengthSq() > 1) {
        this.desiredMove.normalize();
      }
      this.desiredMove.applyAxisAngle(this.upVector, angle);
    } else if (this.isAutoMoving && this.target) {
      this.autoMoveDirection.subVectors(this.target, this.position);
      this.autoMoveDirection.y = 0;
      const distance = this.autoMoveDirection.length();

      if (distance > 0.1) {
        if (!this.autoMoveWasActive) {
          this.autoMoveBlockedSeconds = 0;
          this.autoMoveLastDistance = distance;
        }
        this.desiredMove.copy(this.autoMoveDirection).multiplyScalar(1 / distance);
        targetSpeed = this.params.autoMoveSpeed ?? this.autoMoveSpeed;
        targetSpeed = Math.min(targetSpeed, Math.max(0.85, distance * 2.8));
      } else {
        this.cancelAutoMove();
        this.desiredMove.set(0, 0, 0);
      }
    }

    const hasMovementTarget = this.desiredMove.lengthSq() > 1e-4;
    if (hasMovementTarget) {
      this.desiredVelocity.copy(this.desiredMove).multiplyScalar(targetSpeed);
    } else {
      this.desiredVelocity.set(0, 0, 0);
    }

    const acceleration = hasMovementTarget
      ? (this.params.movementAcceleration ?? 18)
      : (this.params.movementDeceleration ?? 30);
    const smoothing = 1 - Math.exp(-Math.max(0, acceleration) * stepDelta);
    this.horizontalVelocity.lerp(this.desiredVelocity, smoothing);
    if (!hasMovementTarget && this.horizontalVelocity.lengthSq() < 1e-5) {
      this.horizontalVelocity.set(0, 0, 0);
    }
    this.horizontalStep.copy(this.horizontalVelocity).multiplyScalar(stepDelta);
    this.horizontalStep.y = 0;
    const attemptedHorizontalMove = this.horizontalStep.length();
    const blockingHit = this.findHorizontalMoveBlock(collider, this.horizontalStep);
    this.sweepBlocked = Boolean(blockingHit);
    if (blockingHit) {
      const didSlide = this.tryApplySlideStep(collider, this.horizontalStep);
      if (!didSlide) {
        this.horizontalVelocity.set(0, 0, 0);
        this.desiredVelocity.set(0, 0, 0);
      }
    } else {
      this.position.add(this.horizontalStep);
    }

    if (this.sweepBlocked && this.horizontalVelocity.lengthSq() < 1e-5) {
      this.horizontalVelocity.set(0, 0, 0);
      this.desiredVelocity.set(0, 0, 0);
    }

    this.position.addScaledVector(this.visitorVelocity, stepDelta);
    this.updateMatrixWorld();
    this.preCollisionPosition.copy(this.position);
    this.handleCollisions(stepDelta, collider);
    const actualHorizontalMove = Math.hypot(this.position.x - startX, this.position.z - startZ);
    if (this.horizontalCollisionCorrection > Math.max(0.18, this.capsuleInfo.radius * 0.35)) {
      this.recoverFromStuck('excessive collision correction');
      return;
    }
    const hasBlockingCollision =
      this.sweepBlocked ||
      this.verticalCollisionDetected ||
      this.horizontalCollisionCorrection > Math.max(0.015, attemptedHorizontalMove * 0.35);
    this.lastMovementAttempt = attemptedHorizontalMove;
    this.lastMovementProgress = actualHorizontalMove;
    this.updateSafePosition(hasBlockingCollision);
    this.resolveAutoMoveBlock(stepDelta, attemptedHorizontalMove, actualHorizontalMove, hasBlockingCollision);
    this.resolveMovementStuck(stepDelta, hasMovementTarget, attemptedHorizontalMove, actualHorizontalMove, hasBlockingCollision);

    if (this.position.y < -10) {
      console.warn('Visitor fell below floor. Resetting.');
      this.reset();
    }


  }

  updateSafePosition(hasBlockingCollision) {
    if (!this.visitorIsOnGround || hasBlockingCollision) {
      return;
    }
    this.lastSafePosition.copy(this.position);
    this.hasLastSafePosition = true;
  }

  isHorizontalMoveBlocked(collider, movement) {
    return Boolean(this.findHorizontalMoveBlock(collider, movement));
  }

  findHorizontalMoveBlock(collider, movement) {
    const moveDistance = movement.length();
    if (!collider || moveDistance <= 1e-5) return null;

    this.sweepDirection.copy(movement).multiplyScalar(1 / moveDistance);
    const radius = this.capsuleInfo.radius;
    const maxDistance = moveDistance + radius * 0.92;
    const sampleHeights = [radius * 0.35, radius, radius * 1.65];

    for (const height of sampleHeights) {
      this.sweepOrigin.copy(this.position);
      this.sweepOrigin.y += height;
      this.moveRaycaster.set(this.sweepOrigin, this.sweepDirection);
      this.moveRaycaster.near = 0;
      this.moveRaycaster.far = maxDistance;
      const hit = this.moveRaycaster.intersectObject(collider, false)[0];
      if (hit && hit.distance <= maxDistance) {
        if (hit.face) {
          this.sweepNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
          this.sweepHitNormal.copy(hit.face.normal).applyNormalMatrix(this.sweepNormalMatrix).normalize();
          this.sweepHitNormal.y = 0;
          if (this.sweepHitNormal.lengthSq() > 1e-8) {
            this.sweepHitNormal.normalize();
          } else {
            this.sweepHitNormal.copy(this.sweepDirection).multiplyScalar(-1);
          }
        } else {
          this.sweepHitNormal.copy(this.sweepDirection).multiplyScalar(-1);
        }
        return hit;
      }
    }

    return null;
  }

  tryApplySlideStep(collider, movement) {
    if (!collider || movement.lengthSq() <= 1e-10 || this.sweepHitNormal.lengthSq() <= 1e-8) {
      return false;
    }

    this.slideStepA.copy(movement).addScaledVector(this.sweepHitNormal, -movement.dot(this.sweepHitNormal));
    this.slideStepA.y = 0;
    const originalLength = movement.length();
    const slideLength = this.slideStepA.length();
    if (slideLength <= 1e-5) {
      return false;
    }

    if (slideLength > originalLength) {
      this.slideStepA.multiplyScalar(originalLength / slideLength);
    }

    if (!this.isHorizontalMoveBlocked(collider, this.slideStepA)) {
      this.position.add(this.slideStepA);
      this.horizontalVelocity.addScaledVector(this.sweepHitNormal, -this.horizontalVelocity.dot(this.sweepHitNormal));
      this.desiredVelocity.addScaledVector(this.sweepHitNormal, -this.desiredVelocity.dot(this.sweepHitNormal));
      return true;
    }

    this.slideStepB.copy(this.slideStepA).multiplyScalar(0.5);
    if (this.slideStepB.lengthSq() > 1e-10 && !this.isHorizontalMoveBlocked(collider, this.slideStepB)) {
      this.position.add(this.slideStepB);
      this.horizontalVelocity.addScaledVector(this.sweepHitNormal, -this.horizontalVelocity.dot(this.sweepHitNormal));
      this.desiredVelocity.addScaledVector(this.sweepHitNormal, -this.desiredVelocity.dot(this.sweepHitNormal));
      return true;
    }

    return false;
  }

  setJoystickInput(x = 0, y = 0) {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    this.joystickVector.set(clampedX, clampedY);
    if (this.joystickVector.lengthSq() > 1e-4) {
      this.isAutoMoving = false;
    }
  }

  cancelAutoMove() {
    this.isAutoMoving = false;
    this.autoMoveBlockedSeconds = 0;
    this.autoMoveLastDistance = Infinity;
    this.autoMoveWasActive = false;
    this.desiredMove.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.horizontalVelocity.set(0, 0, 0);
    this.stuckSeconds = 0;
    if (this.clickIndicator) {
      this.clickIndicator.visible = false;
    }
  }

  resolveAutoMoveBlock(delta, attemptedHorizontalMove = 0, actualHorizontalMove = 0, hasBlockingCollision = false) {
    if (!this.isAutoMoving || !this.target) {
      this.autoMoveBlockedSeconds = 0;
      this.autoMoveLastDistance = Infinity;
      this.autoMoveWasActive = false;
      return;
    }

    const remaining = Math.hypot(this.target.x - this.position.x, this.target.z - this.position.z);
    const progress = this.autoMoveLastDistance - remaining;
    const expectedMove = Math.max(this.horizontalVelocity.length() * delta, attemptedHorizontalMove);
    const minProgress = Math.max(0.006, expectedMove * 0.12);
    const lowActualMove = expectedMove > 0.01 && actualHorizontalMove < expectedMove * 0.2;

    if ((hasBlockingCollision && progress < minProgress) || lowActualMove) {
      this.autoMoveBlockedSeconds += delta;
    } else {
      this.autoMoveBlockedSeconds = Math.max(0, this.autoMoveBlockedSeconds - delta * 2);
    }

    this.autoMoveLastDistance = remaining;
    this.autoMoveWasActive = true;

    if (this.autoMoveBlockedSeconds > 0.25) {
      console.warn('Visitor auto-move target is blocked. Cancelling movement.');
      this.cancelAutoMove();
      this.recoverFromStuck('auto-move blocked');
    }
  }

  resolveMovementStuck(delta, hasMovementTarget, attemptedHorizontalMove, actualHorizontalMove, hasBlockingCollision) {
    if (!hasMovementTarget || attemptedHorizontalMove <= 0.004) {
      this.stuckSeconds = Math.max(0, this.stuckSeconds - delta * 2);
      return;
    }

    const lowProgress = actualHorizontalMove < Math.max(0.002, attemptedHorizontalMove * 0.18);
    if (hasBlockingCollision && lowProgress) {
      this.stuckSeconds += delta;
    } else {
      this.stuckSeconds = Math.max(0, this.stuckSeconds - delta * 3);
    }

    if (this.stuckSeconds > 0.45) {
      this.recoverFromStuck('collision trap');
    }
  }

  recoverFromStuck(reason = 'stuck', fallbackPosition = null) {
    if (!this.hasLastSafePosition) {
      this.cancelAutoMove();
      this.visitorVelocity.set(0, 0, 0);
      this.horizontalVelocity.set(0, 0, 0);
      if (fallbackPosition) {
        this.position.copy(fallbackPosition);
        this.syncCameraRig();
      }
      this.stuckSeconds = 0;
      return;
    }

    console.warn(`Visitor recovered from ${reason}.`);
    this.cancelAutoMove();
    this.visitorVelocity.set(0, 0, 0);
    this.horizontalVelocity.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.desiredMove.set(0, 0, 0);
    this.position.copy(this.lastSafePosition);
    this.stuckSeconds = 0;
    this.updateMatrixWorld();
    this.syncCameraRig();
  }

  teleportTo(point) {
    this.position.set(point.x, this.position.y, point.z);
    this.lastSafePosition.copy(this.position);
    this.hasLastSafePosition = true;
    this.stuckSeconds = 0;
    this.cancelAutoMove();
    this.target = null;
    this.syncCameraRig();
  }


  _move(x, y, z, angle, delta) {

    this.tempVector.set(x, y, z).applyAxisAngle(this.upVector, angle);
    this.position.addScaledVector(this.tempVector, this.params.visitorSpeed * delta);
  }

  handleCollisions(delta, collider) {

    const capsule = this.capsuleInfo;
    this.tempBox.makeEmpty();
    this.tempMat.copy(collider.matrixWorld).invert();
    this.tempSegment.copy(capsule.segment);

    this.tempSegment.start.applyMatrix4(this.matrixWorld).applyMatrix4(this.tempMat);
    this.tempSegment.end.applyMatrix4(this.matrixWorld).applyMatrix4(this.tempMat);

    this.tempBox.expandByPoint(this.tempSegment.start);
    this.tempBox.expandByPoint(this.tempSegment.end);
    this.tempBox.min.addScalar(-capsule.radius);
    this.tempBox.max.addScalar(capsule.radius);

    this.verticalCollisionDetected = false;
    this.collisionCorrectionMagnitude = 0;
    this.horizontalCollisionCorrection = 0;
    this.lastCollisionCorrection.set(0, 0, 0);



    collider.geometry.boundsTree.shapecast({
      intersectsBounds: box => box.intersectsBox(this.tempBox),
      intersectsTriangle: tri => {
        const triPoint = this.tempVector;
        const capsulePoint = this.tempVector2;
        const dist = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);

        if (dist < capsule.radius) {
          const depth = capsule.radius - dist;
          const direction = capsulePoint.sub(triPoint);
          if (direction.lengthSq() < 1e-12) {
            direction.set(0, 1, 0);
          } else {
            direction.normalize();
          }
          const adj = Math.min(depth, 0.05);//0.05

          this.tempSegment.start.addScaledVector(direction, adj);
          this.tempSegment.end.addScaledVector(direction, adj);

          if (Math.abs(direction.y) < 0.1) {
            this.verticalCollisionDetected = true;
          }
        }
      }
    });

    this.tempVector.copy(this.tempSegment.start).applyMatrix4(collider.matrixWorld);
    this.tempVector2.subVectors(this.tempVector, this.position);

    this.visitorIsOnGround = this.tempVector2.y > Math.abs(delta * this.visitorVelocity.y * 0.25);

    const offset = Math.max(0.0, this.tempVector2.length() - 1e-5);
    this.tempVector2.normalize().multiplyScalar(offset);
    this.lastCollisionCorrection.copy(this.tempVector2);
    this.collisionCorrectionMagnitude = this.lastCollisionCorrection.length();
    this.horizontalCollisionCorrection = Math.hypot(this.lastCollisionCorrection.x, this.lastCollisionCorrection.z);
    this.position.add(this.tempVector2);

    if (!this.visitorIsOnGround) {
      this.visitorVelocity.addScaledVector(this.tempVector2.normalize(), -this.tempVector2.dot(this.visitorVelocity));
    } else {
      this.visitorVelocity.set(0, 0, 0);
    }

    this.syncCameraRig();
  }

  syncCameraRig() {
    this.tempVector.copy(this.position).add(this.params.heightOffset);
    if (this.renderer?.xr?.isPresenting && this.xrRig) {
      // In XR, the headset controls the camera pose. Move the rig instead.
      this.xrRig.position.copy(this.tempVector);
    } else {
      // Desktop: keep OrbitControls target following the visitor
      this.camera.position.sub(this.controls.target);
      this.controls.target.copy(this.tempVector);
      this.camera.position.add(this.tempVector);
    }
  }

  reset() {
    const enterAnchor = this._findEnterAnchor();
    const spawnPosition = this._resolveSpawnPositionFromAnchor(enterAnchor);
    const spawnDirection = this._resolveSpawnDirection(enterAnchor);

    this.visitorVelocity.set(0, 0, 0);
    this.horizontalVelocity.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.desiredMove.set(0, 0, 0);
    this.visitorIsOnGround = true;
    this.verticalCollisionDetected = false;
    this.cancelAutoMove();
    this.position.copy(spawnPosition);
    this.lastSafePosition.copy(this.position);
    this.hasLastSafePosition = true;
    this.stuckSeconds = 0;
    if (spawnDirection) {
      const spawnYaw = Math.atan2(spawnDirection.x, spawnDirection.z);
      this.rotation.set(0, spawnYaw, 0);
    }

    // Optional: reset capsule target or height
    if (!this.target) {
      this.target = new Vector3();
    }
    this.target.copy(this.position.clone().add(new Vector3(0, 10.5, 0)));

    // Update controls, camera or rig
    const offset = this.params.heightOffset ?? new Vector3(0, 4.5, 0);
    const target = this.position.clone().add(offset);
    if (this.renderer?.xr?.isPresenting && this.xrRig) {
      // Place rig at target height; camera orientation comes from HMD
      this.xrRig.position.copy(target);
      if (spawnDirection) {
        const spawnYaw = Math.atan2(spawnDirection.x, spawnDirection.z);
        this.xrRig.rotation.set(0, spawnYaw, 0);
      }
    } else {
      const cameraOffset = this.camera.position.clone().sub(this.controls.target);
      const orbitRadius = Math.max(1e-4, cameraOffset.length());
      this.controls.target.copy(target);
      if (spawnDirection) {
        const flatForward = spawnDirection.clone();
        flatForward.y = 0;
        if (flatForward.lengthSq() > 1e-6) {
          flatForward.normalize();
          this.camera.position.copy(target).addScaledVector(flatForward, -orbitRadius);
          this.camera.lookAt(target);
          this.controls.update();
        } else if (cameraOffset.lengthSq() < 1e-12) {
          this.camera.position.copy(target).add(new Vector3(0, 0, 5));
        } else {
          this.camera.position.copy(target).add(cameraOffset);
        }
      } else if (cameraOffset.lengthSq() < 1e-12) {
        this.camera.position.copy(target).add(new Vector3(0, 0, 5));
      } else {
        this.camera.position.copy(target).add(cameraOffset);
      }
    }

    // Camera rotation
    if (!spawnDirection) {
      const angle =
        typeof this.params.rotateOrbit === 'number' && Number.isFinite(this.params.rotateOrbit)
          ? this.params.rotateOrbit
          : -120;
      rotateOrbit(this.camera, this.controls, angle);
    }
  }

}
