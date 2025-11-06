// modules/applyPitcherControls.js
import { Raycaster, Vector2, Vector3, SpotLight } from 'three';

export function applyPitcherControls(obj, scene, renderer, camera, transform) {
  if (!obj || !scene || !renderer || !camera || !transform) return;
  if (obj.userData._pitcherControlsAttached) return;
  obj.userData._pitcherControlsAttached = true;

  // Attach transform controls and configure defaults
  transform.attach(obj);
  transform.setMode('rotate');
  transform.setSize(0.3);
  transform.enabled = false;

  // Some versions of TransformControls expose getHelper(); guard just in case
  const helper = typeof transform.getHelper === 'function' ? transform.getHelper() : null;
  if (helper) {
    helper.visible = false;
    if (helper.parent !== scene) {
      scene.add(helper);
    }
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const dom = renderer.domElement;

  const spotLight = new SpotLight(0xffffff, 40);
  spotLight.angle = Math.PI / 7;
  spotLight.penumbra = 0.3;
  spotLight.decay = 2;
  spotLight.distance = 35;
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 1024;
  spotLight.shadow.mapSize.height = 1024;
  spotLight.shadow.bias = -0.00005;

  scene.add(spotLight);
  scene.add(spotLight.target);

  const worldPos = new Vector3();

  function syncLightPosition() {
    try {
      obj.updateMatrixWorld(true);
      obj.getWorldPosition(worldPos);
      spotLight.position.set(worldPos.x, worldPos.y + 3, worldPos.z);
      spotLight.target.position.copy(worldPos);
    } catch {
      // swallow
    }
  }
  syncLightPosition();

  let hovering = false;
  let dragging = false;

  function setPointer(event) {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function updateHover(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(obj, true);
    hovering = intersects.length > 0;
    if (!dragging) {
      transform.enabled = hovering;
      if (hovering) {
        transform.setMode('rotate');
      }
      if (helper) helper.visible = hovering;
    }
  }

  function beginDrag(event) {
    updateHover(event);
    if (!hovering) return;
    if (transform.getMode && transform.getMode() !== 'rotate') {
      transform.setMode('rotate');
    } else {
      transform.setMode('rotate');
    }
    dragging = true;
    transform.enabled = true;
    if (helper) helper.visible = true;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    transform.enabled = false;
    if (helper) helper.visible = false;
  }

  dom.addEventListener('pointermove', updateHover);
  dom.addEventListener('pointerdown', beginDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('blur', endDrag);

  function onDraggingChanged(event) {
    dragging = event.value;
    if (!dragging) {
      transform.enabled = false;
      if (helper) helper.visible = false;
    }
  }

  function onTransformChange() {
    syncLightPosition();
  }

  transform.addEventListener('dragging-changed', onDraggingChanged);
  transform.addEventListener('change', onTransformChange);

  const cleanup = () => {
    obj.userData._pitcherControlsAttached = false;
    dom.removeEventListener('pointermove', updateHover);
    dom.removeEventListener('pointerdown', beginDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('blur', endDrag);
    transform.removeEventListener('dragging-changed', onDraggingChanged);
    transform.removeEventListener('change', onTransformChange);
    transform.detach?.(obj);
    transform.enabled = false;
    if (helper) {
      if (helper.parent === scene) {
        scene.remove(helper);
      }
    }
    scene.remove(spotLight);
    scene.remove(spotLight.target);
    spotLight.dispose?.();
  };

  obj.addEventListener('removed', cleanup);
}
