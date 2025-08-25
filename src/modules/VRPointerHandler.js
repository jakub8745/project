// src/modules/VRPointerHandler.js
import {
  Raycaster,
  Matrix4,
  Vector3,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';

export class VRPointerHandler {
  constructor({ scene, visitor, renderer }) {
    this.scene = scene;
    this.visitor = visitor;
    this.renderer = renderer;
    this.raycaster = new Raycaster();

    // --- Red cursor sphere ---
    this.cursor = new Mesh(
      new SphereGeometry(0.1, 16, 16),
      new MeshBasicMaterial({ color: 0xff0000 })
    );
    this.cursor.visible = false;
    this.scene.add(this.cursor);

    if (renderer?.xr) {
      this._setupXRControllers(renderer);
    }
  }

  _setupXRControllers(renderer) {
    const controller1 = renderer.xr.getController(0);
    const controller2 = renderer.xr.getController(1);
    this.scene.add(controller1, controller2);

    [controller1, controller2].forEach((controller) => {
      this._addControllerRay(controller);

      controller.addEventListener('selectstart', () => {
        if (renderer.xr.isPresenting) {
          this._handleController(controller);
        }
      });
    });
  }

  _addControllerRay(controller) {
    const geometry = new BufferGeometry().setFromPoints([
      new Vector3(0, 0, 0),
      new Vector3(0, 0, -1),
    ]);
    const material = new LineBasicMaterial({ color: 0x00ff00 });
    const line = new Line(geometry, material);
    line.name = 'rayHelper';
    line.scale.z = 20; // Long beam (20m)
    controller.add(line);
  }

  _handleController(controller) {
    const tempMatrix = new Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    const hit = intersects.find(
      i =>
        i.object.userData &&
        ['Floor', 'Room', 'Wall'].includes(i.object.userData.type)
    );

    if (hit) {

        console.log(hit);
      // Show cursor at hit point
      this.cursor.position.copy(hit.point);
      this.cursor.visible = true;

      // Move visitor
      this._moveVisitor(hit.point.clone());
    } else {
      this.cursor.visible = false;
    }
  }

  _moveVisitor(point) {
    if (this.visitor) {
      this.visitor.target = point.clone();
      this.visitor.isAutoMoving = true;
    }
  }
}
