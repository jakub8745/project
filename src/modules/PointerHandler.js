import {
  Raycaster,
  Vector2,
  Vector3,
  Mesh,
  MeshBasicMaterial,
  CircleGeometry,
  DoubleSide,
  Quaternion,
  Matrix3,
  MathUtils
} from 'three';

export class PointerHandler {
  constructor({ camera, scene, visitor, popupCallback, deps }) {
    this.camera = camera;
    this.scene = scene;
    this.visitor = visitor;
    this.deps = deps;
    this.params = deps.params;
    this.popupCallback = popupCallback;

    this.raycaster = new Raycaster();
    this.pointer = new Vector2();

    this.renderer = deps.renderer;

    this.pressTimeout = null;
    this.isPressing = false;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.MOVE_THRESHOLD = 5;

    // Click indicator (persistent)
    this.clickIndicator = this._createClickCircle();
    this.scene.add(this.clickIndicator);

    this.sidebar = document.querySelector('.sidebar');
    this.btn = document.getElementById('btn');

    this.lastTapTime = 0;
    this.DOUBLE_TAP_THRESHOLD = 300;

    // Bind handlers
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._addListeners();
  }

  _createClickCircle() {
    const geo = new CircleGeometry(0.15, 32);
    const mat = new MeshBasicMaterial({
      color: 0x459de6,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
      depthWrite: false
    });
    const mesh = new Mesh(geo, mat);
    mesh.visible = false;

    mesh.scale.set(1, 1, 1); // INITIAL SCALE
    /*
    mesh.onBeforeRender = () => {
      if (!mesh.visible) return;
      const t = performance.now() * 0.01; // time factor
      const s = 1 + 0.3 * Math.sin(t); // amplitude
      mesh.scale.set(s, s, s);
    };
*/
    return mesh;
  }

  _addListeners() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
  }

  _onPointerDown(event) {
    event.preventDefault();
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.isDragging = false;
    //this.isPressing = true;

      // DOUBLE-TAP logic:
    const now       = performance.now();
    const delta     = now - this.lastTapTime;
    this.lastTapTime = now;

    if (delta < this.DOUBLE_TAP_THRESHOLD && !this.isDragging) {
      // it’s a double-click/tap!
      this._handleClick(event);
    }
  }

  _onPointerMove(event) {
    if (
      Math.abs(event.clientX - this.startX) > this.MOVE_THRESHOLD ||
      Math.abs(event.clientY - this.startY) > this.MOVE_THRESHOLD
    ) {
      this.isDragging = true;
      clearTimeout(this.pressTimeout);
    }
  }

  _onPointerUp() {
    this.isPressing = false;
    clearTimeout(this.pressTimeout);
  }

  _handleClick(event) {
    const validTypes = ['Image', 'Wall', 'visitorLocation', 'Room', 'Floor', 'Video'];
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.pointer.set(x, y);

    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.firstHitOnly = true;
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    const hit = intersects.find(i => i.object.userData && validTypes.includes(i.object.userData.type));

    if (!hit || !hit.object.userData) return;
    const { type, elementID } = hit.object.userData;

    // Handle image popups, videos, etc.
    if (type === 'Image' && this.popupCallback) {

      this.popupCallback(hit.object.userData);
      return;
    }
    if (type === 'Video') {


      const videoElement = elementID ? document.getElementById(elementID) : null;

      if (videoElement) {
        videoElement.muted = false;
        if (videoElement.paused) {
          videoElement.play().catch(err => console.warn("Couldn't autoplay:", err));
          this._moveToVideo(hit);
        } else {
          videoElement.pause();
        }
      }
      return;
    }

    // Place click indicator on Floor, Room, Wall
    if (['Floor', 'Room', 'Wall'].includes(type)) {
      const point = hit.point.clone();

      // Compute world normal
      const localNormal = hit.face.normal.clone();
      const normalMatrix = new Matrix3().getNormalMatrix(hit.object.matrixWorld);
      const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();

      this._placeClickIndicator(point, worldNormal);
      this._moveVisitor(point);
    }
  }

  _placeClickIndicator(point, worldNormal) {
    // Slight offset to avoid z-fighting
    const offsetPos = point.clone().addScaledVector(worldNormal, 0.02);
    this.clickIndicator.position.copy(offsetPos);

    // Align circle's normal (+Z) to worldNormal
    const quat = new Quaternion().setFromUnitVectors(
      new Vector3(0, 0, 1),
      worldNormal
    );
    this.clickIndicator.setRotationFromQuaternion(quat);
    this.clickIndicator.visible = true;
  }

  _moveVisitor(point) {
    this.visitor.target = point.clone();
    this.visitor.isAutoMoving = true;
  }


  _moveToVideo(clickedObject) {
    if (this.sidebar?.classList.contains('open')) {
      this.sidebar.classList.remove('open');
      this.btn?.classList.remove('open');
    }

    const mesh = clickedObject.object;
    const camera = this.camera;
    const visitor = this.visitor;
    const point = clickedObject.point.clone();

    const blockerRay = new Raycaster(visitor.position, point.clone().sub(visitor.position).normalize());
    blockerRay.far = visitor.position.distanceTo(point);
    const walls = this.scene.children.filter(o => o.userData.type === 'Wall');
    if (blockerRay.intersectObjects(walls, true).length > 0) {
      console.warn("Blocked by wall");
      return;
    }

    const geom = mesh.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!clickedObject.face?.normal) {
      console.error("Missing face normal");
      return;
    }

    const bbox = geom.boundingBox;
    const localNormal = clickedObject.face.normal.clone();
    const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
    const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();
    const centerLocal = bbox.getCenter(new Vector3());
    const centerWorld = mesh.localToWorld(centerLocal);

    if (worldNormal.dot(camera.position.clone().sub(centerWorld)) < 0) {
      worldNormal.negate();
    }

    const forward = new Vector3();
    camera.getWorldDirection(forward);
    const right = camera.up.clone().cross(forward).normalize();

    const localCorners = [
      new Vector3(bbox.min.x, bbox.min.y, 0),
      new Vector3(bbox.max.x, bbox.min.y, 0),
      new Vector3(bbox.min.x, bbox.max.y, 0),
      new Vector3(bbox.max.x, bbox.max.y, 0),
    ];
    const worldCorners = localCorners.map(c => mesh.localToWorld(c));
    const projs = worldCorners.map(c => c.clone().sub(camera.position).dot(right));
    const worldWidth = Math.max(...projs) - Math.min(...projs);

    const vFOV = MathUtils.degToRad(camera.fov);
    const aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
    const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * aspect);
    const extraOffset = 0.5;
    const distance = (worldWidth / 2) / Math.tan(hFOV / 2) + extraOffset;

    const targetPos = centerWorld.clone().addScaledVector(worldNormal, distance);
    this._moveVisitor(targetPos);
  }
}
