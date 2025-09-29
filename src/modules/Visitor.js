// src/modules/Visitor.js
import {
  Mesh,
  Line3,
  Vector3,
  Vector2,
  Raycaster,
  Box3,
  Matrix4,
  Scene,
  MeshStandardMaterial,
  AudioListener

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
    this.visitorIsOnGround = true;
    this.verticalCollisionDetected = false;
    this.target = new Vector3(2, 10, 2);


    this.isAutoMoving = false;
    this.autoMoveSpeed = 5;
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

    this.raycaster = new Raycaster();
    this.downVector = new Vector3(0, -1, 0);

    this.tempVector = new Vector3();
    this.tempVector2 = new Vector3();
    this.tempBox = new Box3();
    this.tempMat = new Matrix4();
    this.tempSegment = new Line3();
    this.upVector = new Vector3(0, 1, 0);

    this.lastFloorName = null;

    this._setupInput();
    deps.visitor = this;


  }

  _setupInput() {
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

    window.addEventListener('keydown', (e) => {
      if (keyMap[e.key] !== undefined) {
        e.preventDefault(); 
        this[keyMap[e.key]] = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (keyMap[e.key] !== undefined) {
        e.preventDefault(); 
        this[keyMap[e.key]] = false;
      }
    });
  }

  update(delta, collider) {

    if (this.visitorIsOnGround) {
      this.visitorVelocity.y = 0;
    } else {
      this.visitorVelocity.y += delta * this.params.gravity;
    }

    const angle = this.controls.getAzimuthalAngle();
    if (this.fwdPressed) this._move(0, 0, -1, angle, delta);
    if (this.bkdPressed) this._move(0, 0, 1, angle, delta);
    if (this.lftPressed) this._move(-1, 0, 0, angle, delta);
    if (this.rgtPressed) this._move(1, 0, 0, angle, delta);

    const joystickStrengthSq = this.joystickVector.lengthSq();
    if (joystickStrengthSq > 1e-4) {
      const strength = Math.min(1, Math.sqrt(joystickStrengthSq));
      this.tempVector
        .set(this.joystickVector.x, 0, -this.joystickVector.y)
        .applyAxisAngle(this.upVector, angle);
      this.position.addScaledVector(this.tempVector, this.params.visitorSpeed * delta * strength);
    }

    if (this.isAutoMoving && this.target) {


      const direction = this.target.clone().sub(this.position);
      direction.y = 0; // 🔥 Ignore vertical difference

      const distance = direction.length();

      if (distance > 0.1) {
        direction.normalize();
        this.position.addScaledVector(direction, this.autoMoveSpeed * delta);
      } else {
        this.isAutoMoving = false;
        this.clickIndicator.visible = false;

      }
    }


    this.position.addScaledVector(this.visitorVelocity, delta);
    this.updateMatrixWorld();
    this.handleCollisions(delta, collider);

    if (this.position.y < -10) {
      console.warn('Visitor fell below floor. Resetting.');
      this.reset();
    }


    const currentFloor = this.checkLocation();
    if (currentFloor && currentFloor.name !== this.lastFloorName) {
      this.lastFloorName = currentFloor.name;
      return { changed: true, newFloor: currentFloor };
    }
    return { changed: false, newFloor: null };
  }

  setJoystickInput(x = 0, y = 0) {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    this.joystickVector.set(clampedX, clampedY);
    if (this.joystickVector.lengthSq() > 1e-4) {
      this.isAutoMoving = false;
    }
  }

  teleportTo(point) {
    this.position.set(point.x, this.position.y, point.z);
    this.isAutoMoving = false;
    this.target = null;
  }


  _move(x, y, z, angle, delta) {

    this.tempVector.set(x, y, z).applyAxisAngle(this.upVector, angle);
    this.position.addScaledVector(this.tempVector, this.params.visitorSpeed * delta);
  }

  checkLocation() {
    if (!this.parent || !this.parent.children || this.parent.children.length === 0) {
      return null;
    }
    this.raycaster.firstHitOnly = true;
    this.raycaster.set(this.position, this.downVector);
    const intersected = this.raycaster.intersectObjects(this.parent.children, true);
    return intersected.find(({ object }) => ["visitorLocation", "Room"].includes(object.userData.type))?.object;
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



    collider.geometry.boundsTree.shapecast({
      intersectsBounds: box => box.intersectsBox(this.tempBox),
      intersectsTriangle: tri => {
        const triPoint = this.tempVector;
        const capsulePoint = this.tempVector2;
        const dist = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);

        if (dist < capsule.radius) {
          const depth = capsule.radius - dist;
          const direction = capsulePoint.sub(triPoint).normalize();
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
    this.position.add(this.tempVector2);

    if (!this.visitorIsOnGround) {
      this.visitorVelocity.addScaledVector(this.tempVector2.normalize(), -this.tempVector2.dot(this.visitorVelocity));
    } else {
      this.visitorVelocity.set(0, 0, 0);
    }

 
    // Update camera/rig depending on XR session state
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

    this.visitorVelocity.set(0, 0, 0);

    this.position.copy(this.params.visitorEnter || new Vector3(0, 10, 0));

    // Optional: reset capsule target or height
    this.target.copy(this.position.clone().add(new Vector3(0, 10.5, 0)));

    // Update controls, camera or rig
    const offset = this.params.heightOffset || new Vector3(0, 4.5, 0);
    const target = this.position.clone().add(offset);
    if (this.renderer?.xr?.isPresenting && this.xrRig) {
      // Place rig at target height; camera orientation comes from HMD
      this.xrRig.position.copy(target);
    } else {
      this.controls.target.copy(target);
      this.camera.position.copy(target.clone().add(new Vector3(0, 0, 5))); // fallback offset
    }

    // Camera rotation
    rotateOrbit(this.camera, this.controls, this.params.rotateOrbit || -120);
  }

}
