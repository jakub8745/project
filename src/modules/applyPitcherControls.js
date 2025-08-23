// modules/applyPitcherControls.js
import { Vector2, Vector3, SpotLight } from 'three';

export function applyPitcherControls(obj, scene, renderer, camera, transform) {
  // attach transform
  transform.attach(obj);
  transform.setMode('rotate');
  transform.setSize(0.5);

  const gizmo = transform.getHelper();
  gizmo.visible = false;
  scene.add(gizmo);

  // re-use transform’s raycaster
  const raycaster = transform.getRaycaster();
  const pointer = new Vector2();

  function updatePointer(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(obj, true);
    gizmo.visible = intersects.length > 0;
  });

  window.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
      case 'v': gizmo.visible = !gizmo.visible; break;
      case 't': transform.setMode('translate'); break;
      case 'r': transform.setMode('rotate'); break;
    }
  });

  // spotlight
  const spot = new SpotLight(0xffffff, 50);
  spot.angle = Math.PI / 6;
  spot.penumbra = 0.2;
  spot.decay = 2;
  spot.distance = 50;
  spot.castShadow = true;
  spot.shadow.mapSize.width = 2048;
  spot.shadow.mapSize.height = 2048;
  spot.shadow.bias = -0.0001;

  scene.add(spot);
  scene.add(spot.target);

  const tmpPos = new Vector3();
  transform.addEventListener('change', (e) => {
    obj.getWorldPosition(tmpPos);
    spot.position.set(tmpPos.x, tmpPos.y + 5, tmpPos.z);
    spot.target.position.copy(tmpPos);
    gizmo.visible = e.value;
  });
}
