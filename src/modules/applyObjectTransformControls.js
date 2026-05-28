import { Raycaster, Vector2, Vector3, SpotLight } from 'three';

const CONTROL_STATES = new WeakMap();

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function coerceNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceColor(value, fallback) {
  return typeof value === 'string' || typeof value === 'number' ? value : fallback;
}

function coerceMode(value, fallback = 'rotate') {
  return value === 'translate' || value === 'rotate' || value === 'scale' ? value : fallback;
}

function normalizeTransformControlOptions(options = {}) {
  const record = asRecord(options) || {};
  const light = asRecord(record.light) || asRecord(record.spotLight) || {};
  return {
    mode: coerceMode(record.mode, 'rotate'),
    size: coerceNumber(record.size, 0.3),
    hover: coerceBoolean(record.hover, true),
    light: {
      enabled: coerceBoolean(light.enabled, true),
      color: coerceColor(light.color, 0xffffff),
      intensity: coerceNumber(light.intensity, 40),
      yOffset: coerceNumber(light.yOffset, 3),
      angle: coerceNumber(light.angle, Math.PI / 7),
      penumbra: coerceNumber(light.penumbra, 0.3),
      decay: coerceNumber(light.decay, 2),
      distance: coerceNumber(light.distance, 35),
      castShadow: coerceBoolean(light.castShadow, true),
      shadowMapSize: coerceNumber(light.shadowMapSize, 2048),
      shadowBias: coerceNumber(light.shadowBias, 0),
      shadowNormalBias: coerceNumber(light.shadowNormalBias, 0.02),
      shadowRadius: coerceNumber(light.shadowRadius, 2),
      shadowCameraNear: coerceNumber(light.shadowCameraNear, 0.5),
      shadowCameraFar: coerceNumber(light.shadowCameraFar, 40)
    }
  };
}

export function applyObjectTransformControls(obj, scene, renderer, camera, transform, options = {}) {
  if (!obj || !scene || !renderer || !camera || !transform) return null;
  if (obj.userData._objectTransformControlsAttached) return null;
  obj.userData._objectTransformControlsAttached = true;

  const config = normalizeTransformControlOptions(options);
  const worldPos = new Vector3();

  const spotLight = config.light.enabled ? new SpotLight(config.light.color, config.light.intensity) : null;
  if (spotLight) {
    spotLight.angle = config.light.angle;
    spotLight.penumbra = config.light.penumbra;
    spotLight.decay = config.light.decay;
    spotLight.distance = config.light.distance;
    spotLight.castShadow = config.light.castShadow;
    spotLight.shadow.mapSize.width = config.light.shadowMapSize;
    spotLight.shadow.mapSize.height = config.light.shadowMapSize;
    spotLight.shadow.bias = config.light.shadowBias;
    spotLight.shadow.normalBias = config.light.shadowNormalBias;
    spotLight.shadow.radius = config.light.shadowRadius;
    spotLight.shadow.camera.near = config.light.shadowCameraNear;
    spotLight.shadow.camera.far = config.light.shadowCameraFar;
    scene.add(spotLight);
    scene.add(spotLight.target);
  }

  function syncLightPosition() {
    if (!spotLight) return;
    obj.updateMatrixWorld(true);
    obj.getWorldPosition(worldPos);
    spotLight.position.set(worldPos.x, worldPos.y + config.light.yOffset, worldPos.z);
    spotLight.target.position.copy(worldPos);
  }
  syncLightPosition();

  const state = getControlState(transform, renderer, camera);
  const entry = { obj, scene, config, spotLight, syncLightPosition };
  state.entries.add(entry);

  const cleanup = () => {
    obj.userData._objectTransformControlsAttached = false;
    state.entries.delete(entry);
    if (state.currentEntry === entry) {
      state.currentEntry = null;
      state.dragging = false;
      hideControl(state);
    }
    if (spotLight) {
      scene.remove(spotLight);
      scene.remove(spotLight.target);
      spotLight.dispose?.();
    }
    if (state.entries.size === 0) {
      disposeControlState(transform);
    }
  };

  obj.addEventListener('removed', cleanup);
  return cleanup;
}

function getControlState(transform, renderer, camera) {
  const existing = CONTROL_STATES.get(transform);
  if (existing) {
    existing.renderer = renderer;
    existing.camera = camera;
    return existing;
  }

  const state = {
    transform,
    renderer,
    camera,
    entries: new Set(),
    raycaster: new Raycaster(),
    pointer: new Vector2(),
    currentEntry: null,
    dragging: false,
    hideTimer: null,
    helper: typeof transform.getHelper === 'function' ? transform.getHelper() : null,
    onPointerMove: null,
    onPointerDown: null,
    onPointerLeave: null,
    onPointerUp: null,
    onBlur: null,
    onDraggingChanged: null,
    onTransformChange: null
  };

  transform.enabled = false;
  if (state.helper) state.helper.visible = false;

  state.onPointerMove = (event) => {
    if (state.dragging) return;
    const entry = pickEntry(state, event);
    if (entry && entry.config.hover !== false) {
      cancelHideTimer(state);
      showControlForEntry(state, entry);
      return;
    }
    if (!entry || entry.config.hover === false) {
      scheduleHideControl(state);
      return;
    }
  };

  state.onPointerDown = (event) => {
    const entry = pickEntry(state, event);
    if (!entry) {
      if (state.currentEntry) {
        cancelHideTimer(state);
      }
      return;
    }
    showControlForEntry(state, entry);
  };

  state.onPointerLeave = () => {
    if (!state.dragging) {
      scheduleHideControl(state);
    }
  };

  state.onPointerUp = () => {
    if (!state.dragging) return;
    state.dragging = false;
    scheduleHideControl(state);
  };

  state.onBlur = () => {
    state.dragging = false;
    state.currentEntry = null;
    cancelHideTimer(state);
    hideControl(state);
  };

  state.onDraggingChanged = (event) => {
    state.dragging = event.value === true;
    if (state.dragging) {
      cancelHideTimer(state);
    } else {
      scheduleHideControl(state);
    }
  };

  state.onTransformChange = () => {
    state.currentEntry?.syncLightPosition();
  };

  const dom = renderer.domElement;
  dom.addEventListener('pointermove', state.onPointerMove);
  dom.addEventListener('pointerdown', state.onPointerDown);
  dom.addEventListener('pointerleave', state.onPointerLeave);
  window.addEventListener('pointerup', state.onPointerUp);
  window.addEventListener('blur', state.onBlur);
  transform.addEventListener('dragging-changed', state.onDraggingChanged);
  transform.addEventListener('change', state.onTransformChange);

  CONTROL_STATES.set(transform, state);
  return state;
}

function disposeControlState(transform) {
  const state = CONTROL_STATES.get(transform);
  if (!state) return;

  const dom = state.renderer.domElement;
  dom.removeEventListener('pointermove', state.onPointerMove);
  dom.removeEventListener('pointerdown', state.onPointerDown);
  dom.removeEventListener('pointerleave', state.onPointerLeave);
  window.removeEventListener('pointerup', state.onPointerUp);
  window.removeEventListener('blur', state.onBlur);
  transform.removeEventListener('dragging-changed', state.onDraggingChanged);
  transform.removeEventListener('change', state.onTransformChange);
  cancelHideTimer(state);
  hideControl(state);
  if (state.helper?.parent) {
    state.helper.parent.remove(state.helper);
  }
  CONTROL_STATES.delete(transform);
}

function pickEntry(state, event) {
  if (!state.entries.size) return null;

  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);

  const roots = Array.from(state.entries, (entry) => entry.obj);
  const intersections = state.raycaster.intersectObjects(roots, true);
  for (const hit of intersections) {
    const entry = findEntryForObject(state, hit.object);
    if (entry) return entry;
  }
  return null;
}

function findEntryForObject(state, object) {
  let current = object;
  while (current) {
    for (const entry of state.entries) {
      if (entry.obj === current) return entry;
    }
    current = current.parent;
  }
  return null;
}

function showControlForEntry(state, entry) {
  cancelHideTimer(state);
  state.currentEntry = entry;
  const { transform, helper } = state;
  transform.attach(entry.obj);
  transform.setMode(entry.config.mode);
  transform.setSize(entry.config.size);
  transform.enabled = true;
  if (helper) {
    helper.visible = true;
    if (helper.parent !== entry.scene) {
      helper.parent?.remove(helper);
      entry.scene.add(helper);
    }
  }
  entry.syncLightPosition();
}

function hideControl(state) {
  cancelHideTimer(state);
  state.currentEntry = null;
  state.transform.enabled = false;
  state.transform.detach?.();
  if (state.helper) state.helper.visible = false;
}

function scheduleHideControl(state) {
  if (!state.currentEntry || state.hideTimer) return;
  state.hideTimer = window.setTimeout(() => {
    state.hideTimer = null;
    if (!state.dragging) {
      hideControl(state);
    }
  }, 2000);
}

function cancelHideTimer(state) {
  if (!state.hideTimer) return;
  window.clearTimeout(state.hideTimer);
  state.hideTimer = null;
}
