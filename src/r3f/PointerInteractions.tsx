import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  type Intersection,
  Raycaster,
  Vector2,
  Vector3,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  CircleGeometry,
  DoubleSide,
  Quaternion,
  Matrix3,
  Matrix4,
  Object3D
} from 'three';
import { createTooltip } from '../modules/Tooltip.js';
import type Visitor from '../modules/Visitor';
import { toSafeExternalUrl } from '../utils/url';
import { invokeVideoControlById, openVideoPlayerById, resumeVideoAudioById } from '../modules/applyVideoMeshes.js';
import type { VideoPlaybackMode } from '../modules/videoPlaybackMode.js';
import { resolveObjectRuntimeData, type ObjectRegistry } from '../modules/objectRegistry.js';

type MetaRecord = Record<string, Record<string, unknown>>;
const CLICKABLE_TYPES = ['Image', 'Wall', 'Walls', 'visitorLocation', 'Room', 'Floor', 'Video', 'VideoControl', 'Link'];
const PRIMARY_CLICKABLE_TYPES = new Set(['Image', 'Video', 'VideoControl', 'Link']);
const HOVERABLE_TYPES = new Set(['Link', 'Image', 'Video', 'Sculpture', 'Floor', 'Wall', 'Walls']);
const TARGET_CACHE_MS = 250;
const OCCLUSION_EPSILON = 0.04;

export interface PointerPopupPayload {
  type: string;
  key: string;
  userData: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface PointerInteractionsProps {
  visitor: Visitor | null;
  collider?: Mesh | null;
  popupCallback?: (payload: PointerPopupPayload) => void;
  links?: Record<string, unknown>;
  imagesMeta?: MetaRecord;
  videosMeta?: MetaRecord;
  videosInteraction?: Record<string, { interactive?: boolean; playbackMode?: VideoPlaybackMode }>;
  sculpturesMeta?: MetaRecord;
  objectRegistry?: ObjectRegistry;
  onCloseSidebar?: () => void;
  disabled?: boolean;
}

function createClickIndicator() {
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
  mesh.name = 'clickIndicator';
  mesh.scale.set(1, 1, 1);
  return mesh;
}

function createXrControllerRay() {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(0, 0, 0),
    new Vector3(0, 0, -12)
  ]);
  const material = new LineBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false
  });
  const line = new Line(geometry, material);
  line.name = 'xr-controller-ray';
  line.visible = false;
  line.renderOrder = 1000;
  return line;
}

export function PointerInteractions({
  visitor,
  collider,
  popupCallback,
  links = {},
  imagesMeta = {},
  videosMeta = {},
  videosInteraction = {},
  sculpturesMeta = {},
  objectRegistry,
  onCloseSidebar,
  disabled = false
}: PointerInteractionsProps) {
  const { camera, scene, gl } = useThree();

  const raycaster = useMemo(() => new Raycaster(), []);
  const occlusionRaycaster = useMemo(() => new Raycaster(), []);
  const pathRaycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const clickIndicator = useMemo(() => createClickIndicator(), []);
  const tooltip = useMemo(() => createTooltip(), []);

  const moveThreshold = 5;
  const doubleTapThreshold = 300;

  const isDraggingRef = useRef(false);
  const startCoordsRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const seekDragRef = useRef<{ videoKey: string | null }>({ videoKey: null });
  const targetCacheRef = useRef<{ at: number; hover: Mesh[]; click: Mesh[]; primaryClick: Mesh[] }>({
    at: 0,
    hover: [],
    click: [],
    primaryClick: []
  });

  useEffect(() => {
    if (!visitor) return undefined;

    scene.add(clickIndicator);
    visitor.clickIndicator = clickIndicator;

    return () => {
      scene.remove(clickIndicator);
      if (visitor.clickIndicator === clickIndicator) {
        visitor.clickIndicator = null;
      }
    };
  }, [clickIndicator, scene, visitor]);

  useEffect(() => {
    return () => {
      tooltip.destroy?.();
    };
  }, [tooltip]);

  useEffect(() => {
    const xrControllers = [gl.xr.getController(0), gl.xr.getController(1)];
    const controllerRays = xrControllers.map(() => createXrControllerRay());
    const addedControllers: Object3D[] = [];
    const setControllerRaysVisible = (visible: boolean) => {
      controllerRays.forEach((ray) => {
        ray.visible = visible;
      });
    };

    xrControllers.forEach((controller, index) => {
      controller.add(controllerRays[index]);
      if (!controller.parent) {
        scene.add(controller);
        addedControllers.push(controller);
      }
    });

    const handleXrSessionStart = () => setControllerRaysVisible(true);
    const handleXrSessionEnd = () => setControllerRaysVisible(false);
    gl.xr.addEventListener('sessionstart', handleXrSessionStart);
    gl.xr.addEventListener('sessionend', handleXrSessionEnd);
    setControllerRaysVisible(gl.xr.isPresenting);

    return () => {
      gl.xr.removeEventListener('sessionstart', handleXrSessionStart);
      gl.xr.removeEventListener('sessionend', handleXrSessionEnd);
      controllerRays.forEach((ray) => {
        ray.removeFromParent();
        ray.geometry.dispose();
        if (Array.isArray(ray.material)) {
          ray.material.forEach((material) => material.dispose());
        } else {
          ray.material.dispose();
        }
      });
      addedControllers.forEach((controller) => {
        scene.remove(controller);
      });
    };
  }, [gl, scene]);

  useEffect(() => {
    if (!visitor) return undefined;

    const canvas = gl.domElement;

    const resolveHitRuntime = (object: Mesh) => {
      const runtimeData = resolveObjectRuntimeData(object, objectRegistry);
      const userData = { ...(object.userData || {}) } as Record<string, unknown>;
      if (runtimeData?.type) userData.type = runtimeData.type;
      if (runtimeData?.ref) {
        userData.name = runtimeData.ref;
        if (runtimeData.type === 'Video' || runtimeData.type === 'VideoControl') {
          userData.elementID = runtimeData.ref;
        }
      }
      const type = typeof userData.type === 'string' ? userData.type : runtimeData?.type;
      const key =
        (runtimeData?.entry && typeof runtimeData.entry.objectName === 'string' ? runtimeData.entry.objectName : undefined) ||
        (typeof userData.__objectRegistryKey === 'string' ? userData.__objectRegistryKey : undefined) ||
        runtimeData?.ref ||
        (typeof userData.name === 'string' ? userData.name : undefined) ||
        object.name;
      const elementID =
        typeof userData.elementID === 'string'
          ? userData.elementID
          : runtimeData?.type === 'Video' || runtimeData?.type === 'VideoControl'
            ? runtimeData.ref
            : undefined;
      return { type, key, elementID, userData, entry: runtimeData?.entry };
    };

    const hasVideoControlProxyAncestor = (object: Mesh) => {
      let current = object.parent;
      while (current) {
        if (current.userData?.__isVideoControlProxy === true) {
          return true;
        }
        current = current.parent;
      }
      return false;
    };

    const getRaycastTargets = () => {
      const now = performance.now();
      const cached = targetCacheRef.current;
      if (
        now - cached.at < TARGET_CACHE_MS &&
        (cached.hover.length > 0 || cached.click.length > 0 || cached.primaryClick.length > 0)
      ) {
        return cached;
      }

      const hover: Mesh[] = [];
      const click: Mesh[] = [];
      const primaryClick: Mesh[] = [];
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const { type } = resolveHitRuntime(object);
        const isVideoControlProxy = object.userData?.__isVideoControlProxy === true || hasVideoControlProxyAncestor(object);
        if ((type && CLICKABLE_TYPES.includes(type)) || isVideoControlProxy) {
          click.push(object);
        }
        if ((type && PRIMARY_CLICKABLE_TYPES.has(type)) || isVideoControlProxy) {
          primaryClick.push(object);
        }
        if (type && HOVERABLE_TYPES.has(type)) {
          hover.push(object);
        }
      });
      targetCacheRef.current = { at: now, hover, click, primaryClick };
      return targetCacheRef.current;
    };

    const hideHoverTooltip = () => {
      tooltip.hide();
    };

    const stopAutoMove = () => {
      visitor.isAutoMoving = false;
      if (visitor.clickIndicator) {
        visitor.clickIndicator.visible = false;
      }
    };

    const isOccludedByCollider = (hit: Intersection, originOverride?: Vector3) => {
      if (!collider || hit.object === collider) return false;
      const rayOrigin = originOverride?.clone() ?? camera.getWorldPosition(new Vector3());
      const direction = hit.point.clone().sub(rayOrigin);
      const distance = direction.length();
      if (distance <= OCCLUSION_EPSILON) return false;
      direction.normalize();
      occlusionRaycaster.firstHitOnly = true;
      occlusionRaycaster.near = 0;
      occlusionRaycaster.far = Math.max(0, distance - OCCLUSION_EPSILON);
      occlusionRaycaster.set(rayOrigin, direction);
      const blocker = occlusionRaycaster.intersectObject(collider, false)[0];
      return Boolean(blocker && blocker.distance < distance - OCCLUSION_EPSILON);
    };

    const hasReachableWalkingPath = (point: Vector3) => {
      if (!collider) return true;

      const startBase = visitor.position;
      const distance = Math.hypot(point.x - startBase.x, point.z - startBase.z);
      if (distance < 0.35) return true;

      const probeY = Math.max(startBase.y, point.y) + 0.75;
      const start = new Vector3(startBase.x, probeY, startBase.z);
      const end = new Vector3(point.x, probeY, point.z);
      const direction = end.sub(start);
      const rayDistance = direction.length();
      if (rayDistance < 0.35) return true;

      direction.normalize();
      pathRaycaster.firstHitOnly = false;
      pathRaycaster.near = 0.15;
      pathRaycaster.far = Math.max(0, rayDistance - 0.35);
      pathRaycaster.set(start, direction);

      const normalMatrix = new Matrix3().getNormalMatrix(collider.matrixWorld);
      const hits = pathRaycaster.intersectObject(collider, false);
      return !hits.some((hit) => {
        if (!hit.face || hit.distance >= pathRaycaster.far) return false;
        const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        return Math.abs(normal.y) < 0.55;
      });
    };

    const placeClickIndicator = (point: Vector3, worldNormal: Vector3) => {
      const offsetPos = point.clone().addScaledVector(worldNormal, 0.02);
      clickIndicator.position.copy(offsetPos);
      const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), worldNormal);
      clickIndicator.setRotationFromQuaternion(quat);
      clickIndicator.visible = true;
    };

    const findSupportedDestination = (point: Vector3, worldNormal: Vector3, hitType?: string) => {
      if (!collider) return null;

      const horizontalNormal = worldNormal.clone();
      horizontalNormal.y = 0;
      if (horizontalNormal.lengthSq() > 1e-6) {
        horizontalNormal.normalize();
      }

      const toVisitor = visitor.position.clone().sub(point);
      toVisitor.y = 0;
      if (toVisitor.lengthSq() > 1e-6) {
        toVisitor.normalize();
      }

      const offsets = hitType === 'Wall' || hitType === 'Walls'
        ? [
            new Vector3(0, 0, 0),
            toVisitor.clone().multiplyScalar(0.75),
            toVisitor.clone().multiplyScalar(1.25),
            horizontalNormal.clone().multiplyScalar(0.75),
            horizontalNormal.clone().multiplyScalar(-0.75),
            horizontalNormal.clone().multiplyScalar(1.25),
            horizontalNormal.clone().multiplyScalar(-1.25)
          ]
        : [
            new Vector3(0, 0, 0),
            toVisitor.clone().multiplyScalar(0.25),
            horizontalNormal.clone().multiplyScalar(0.25),
            horizontalNormal.clone().multiplyScalar(-0.25)
          ];

      const probeRaycaster = new Raycaster();
      probeRaycaster.firstHitOnly = false;
      const up = new Vector3(0, 1, 0);
      const down = new Vector3(0, -1, 0);
      const normalMatrix = new Matrix3().getNormalMatrix(collider.matrixWorld);
      let best: { point: Vector3; normal: Vector3; score: number } | null = null;

      for (const offset of offsets) {
        const origin = point.clone().add(offset);
        origin.y = Math.max(point.y, visitor.position.y) + 4;
        probeRaycaster.set(origin, down);
        probeRaycaster.far = 12;
        const hits = probeRaycaster.intersectObject(collider, false);
        for (const candidate of hits) {
          if (!candidate.face) continue;
          const candidateNormal = candidate.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          if (candidateNormal.dot(up) < 0.55) continue;
          const verticalDistance = Math.abs(candidate.point.y - visitor.position.y);
          if (verticalDistance > 3) continue;
          const horizontalDistance = Math.hypot(
            candidate.point.x - visitor.position.x,
            candidate.point.z - visitor.position.z
          );
          const clickDistance = Math.hypot(candidate.point.x - point.x, candidate.point.z - point.z);
          const score = clickDistance + horizontalDistance * 0.05;
          if (!best || score < best.score) {
            best = {
              point: candidate.point.clone().addScaledVector(candidateNormal, 0.04),
              normal: candidateNormal,
              score
            };
          }
          break;
        }
      }

      return best;
    };

    const moveVisitor = (point: Vector3, worldNormal: Vector3, hitType?: string, mode: 'walk' | 'teleport' = 'walk') => {
      const destination = findSupportedDestination(point, worldNormal, hitType);
      if (!destination) {
        stopAutoMove();
        console.warn('PointerInteractions: ignored movement click without supported floor below target.');
        return;
      }
      if (mode === 'teleport') {
        stopAutoMove();
        visitor.teleportTo(destination.point);
        placeClickIndicator(destination.point, destination.normal);
        window.setTimeout(() => {
          if (visitor.clickIndicator === clickIndicator) {
            clickIndicator.visible = false;
          }
        }, 450);
        return;
      }
      if (!hasReachableWalkingPath(destination.point)) {
        stopAutoMove();
        console.warn('PointerInteractions: ignored movement click because the destination is blocked by collision geometry.');
        return;
      }
      placeClickIndicator(destination.point, destination.normal);
      visitor.target = destination.point.clone();
      visitor.isAutoMoving = true;
    };

    const resolveLinkTarget = (linkKey: string, userData: Record<string, unknown> = {}) => {
      const linkMap = links || {};
      const configEntry = linkMap[linkKey];

      if (typeof configEntry === 'string') {
        return { url: configEntry, label: configEntry };
      }

      if (configEntry && typeof configEntry === 'object') {
        const entry = configEntry as Record<string, unknown>;
        const url =
          (typeof entry.url === 'string' && entry.url) ||
          (typeof entry.href === 'string' && entry.href) ||
          (typeof entry.link === 'string' && entry.link) ||
          (typeof userData.url === 'string' ? userData.url : undefined);
        const label =
          (typeof entry.label === 'string' && entry.label) ||
          (typeof entry.title === 'string' && entry.title) ||
          (typeof entry.text === 'string' && entry.text) ||
          url ||
          linkKey;
        if (url) {
          return { url, label };
        }
      }

      if (typeof userData?.url === 'string') {
        return { url: userData.url, label: userData.url };
      }

      return null;
    };

    const resolveImageMeta = (imageKey: string) => {
      const meta = imagesMeta?.[imageKey];
      if (!meta) return null;
      const title =
        (typeof meta.tooltipLabel === 'string' && meta.tooltipLabel) ||
        (typeof meta.title === 'string' && meta.title) ||
        imageKey;
      const author = (typeof meta.author === 'string' && meta.author) || '';
      return { title, author };
    };

    const resolveVideoMeta = (videoKey: string, userData: Record<string, unknown> = {}) => {
      const meta = videosMeta?.[videoKey];
      if (!meta && !userData) return null;
      const tooltipLabel =
        (typeof meta?.tooltipLabel === 'string' && meta.tooltipLabel.trim()) ||
        (typeof userData?.tooltipLabel === 'string' && userData.tooltipLabel.trim()) ||
        '';
      const title =
        tooltipLabel ||
        (typeof meta?.title === 'string' && meta.title.trim()) ||
        (typeof userData?.title === 'string' && userData.title.trim()) ||
        '';
      const description =
        (typeof meta?.description === 'string' && meta.description.trim()) ||
        (typeof userData?.description === 'string' && userData.description.trim()) ||
        (typeof userData?.opis === 'string' && userData.opis.trim()) ||
        '';
      const author =
        (typeof meta?.author === 'string' && meta.author.trim()) ||
        (typeof userData?.author === 'string' && userData.author.trim()) ||
        (typeof userData?.autor === 'string' && userData.autor.trim()) ||
        '';
      return { title, description, author };
    };

    const resolveSculptureMeta = (sculptureKey: string, userData: Record<string, unknown> = {}) => {
      const meta = sculpturesMeta?.[sculptureKey];
      if (!meta && !userData) return null;
      const title =
        (meta?.tooltipLabel as string | undefined) ||
        (userData?.tooltipLabel as string | undefined) ||
        (meta?.title as string | undefined) ||
        (userData?.title as string | undefined) ||
        '';
      const description =
        (meta?.description as string | undefined) ||
        (userData?.description as string | undefined) ||
        (userData?.opis as string | undefined) ||
        '';
      const author =
        (meta?.author as string | undefined) ||
        (userData?.author as string | undefined) ||
        (userData?.autor as string | undefined) ||
        '';
      return { title, description, author };
    };

    const resolveObjectTooltipLabel = (entry: Record<string, unknown> | undefined, userData: Record<string, unknown> = {}) =>
      (typeof entry?.tooltipLabel === 'string' && entry.tooltipLabel) ||
      (typeof userData.tooltipLabel === 'string' && userData.tooltipLabel) ||
      '';

    const handleHover = (event: PointerEvent) => {
      if (disabled) {
        hideHoverTooltip();
        return;
      }
      const bounds = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      raycaster.firstHitOnly = true;
      const intersects = raycaster.intersectObjects(getRaycastTargets().hover, false);
      const hit = intersects.find((i) => {
        const t = resolveHitRuntime(i.object as Mesh).type;
        return typeof t === 'string' && HOVERABLE_TYPES.has(t) && !isOccludedByCollider(i);
      });

      if (!hit) {
        hideHoverTooltip();
        return;
      }

      const { type, key, elementID, userData, entry } = resolveHitRuntime(hit.object as Mesh);
      let displayText = '';

      if (type === 'Link') {
        const linkInfo = resolveLinkTarget(key, userData);
        if (!linkInfo?.url) {
          hideHoverTooltip();
          return;
        }
        displayText = linkInfo.label || linkInfo.url;
      } else if (type === 'Image') {
        const imageInfo = resolveImageMeta(key);
        if (!imageInfo) {
          hideHoverTooltip();
          return;
        }
        displayText = imageInfo.author ? `${imageInfo.title} — ${imageInfo.author}` : imageInfo.title;
      } else if (type === 'Video') {
        const videoKey = elementID || key;
        const videoInfo = resolveVideoMeta(videoKey, userData);
        if (!videoInfo) {
          hideHoverTooltip();
          return;
        }
        const parts: string[] = [];
        if (videoInfo.title) parts.push(videoInfo.title);
        if (videoInfo.author) parts.push(videoInfo.author);
        if (videoInfo.description) parts.push(videoInfo.description);
        if (parts.length === 0) {
          hideHoverTooltip();
          return;
        }
        displayText = parts.join(' — ');
      } else if (type === 'Sculpture') {
        const sculptureInfo = resolveSculptureMeta(key, userData);
        if (!sculptureInfo) {
          hideHoverTooltip();
          return;
        }
        const parts: string[] = [];
        if (sculptureInfo.title) parts.push(sculptureInfo.title);
        if (sculptureInfo.author) parts.push(sculptureInfo.author);
        if (sculptureInfo.description) parts.push(sculptureInfo.description);
        if (parts.length === 0) {
          hideHoverTooltip();
          return;
        }
        displayText = parts.join(' — ');
      } else if (type === 'Floor' || type === 'Wall' || type === 'Walls') {
        displayText = resolveObjectTooltipLabel(entry, userData);
        if (!displayText) {
          hideHoverTooltip();
          return;
        }
      } else {
        hideHoverTooltip();
        return;
      }

      const pointerType = typeof event.pointerType === 'string' ? event.pointerType : '';
      const isTouch = pointerType === 'touch';
      const offsetX = isTouch ? 0 : 12;
      let offsetY = 12;
      if (isTouch) {
        const approxLines = Math.max(1, Math.ceil(displayText.length / 32));
        offsetY = -60 - (approxLines - 1) * 26;
      }

      const tooltipKey = `${type}:${key}`;
      tooltip.show({
        x: event.clientX + offsetX,
        y: event.clientY + offsetY,
        text: displayText,
        key: tooltipKey
      });
    };

    const pickClickHit = (occlusionOrigin?: Vector3, requireNavigationOcclusion = false) => {
      const targets = getRaycastTargets();
      const primaryIntersects = raycaster.intersectObjects(targets.primaryClick, false);
      const hitPrimary = primaryIntersects.find((i) => {
        const { type } = resolveHitRuntime(i.object as Mesh);
        return Boolean(type && PRIMARY_CLICKABLE_TYPES.has(type) && !isOccludedByCollider(i, occlusionOrigin));
      });
      return hitPrimary || raycaster.intersectObjects(targets.click, false).find((i) => {
        const { type } = resolveHitRuntime(i.object as Mesh);
        const isNavigationTarget = type === 'Floor' || type === 'Room' || type === 'Wall' || type === 'Walls';
        return Boolean(
          type &&
          CLICKABLE_TYPES.includes(type) &&
          ((!requireNavigationOcclusion && isNavigationTarget) || !isOccludedByCollider(i, occlusionOrigin))
        );
      });
    };

    const activateHit = (hit: Intersection | undefined, movementMode: 'walk' | 'teleport' = 'walk') => {
      if (!hit) return;

      const { type, elementID, key, userData } = resolveHitRuntime(hit.object as Mesh);

      if (type === 'Image' && popupCallback) {
        const meta = key ? imagesMeta?.[key] : undefined;
        popupCallback({
          type,
          key,
          userData,
          meta
        });
        return;
      }

      if (type === 'Video') {
        const videoKey = typeof elementID === 'string' && elementID ? elementID : key;
        if (!videoKey) return;
        const interactionCfg = videoKey ? videosInteraction?.[videoKey] : undefined;
        if (interactionCfg?.interactive === false) {
          return;
        }
        const playbackMode = interactionCfg?.playbackMode ?? 'direct_modal';
        if (playbackMode === 'synced_silent') {
          return;
        }
        const opened = openVideoPlayerById(videoKey);
        if (opened) return;

        const videoElement = videoKey ? document.getElementById(videoKey) : null;

        if (videoElement instanceof HTMLVideoElement) {
          resumeVideoAudioById(videoKey);
          videoElement.play().catch((err) => console.warn("Couldn't autoplay:", err));
        }
        return;
      }

      if (type === 'VideoControl') {
        const videoKey = typeof elementID === 'string' && elementID ? elementID : key;
        if (!videoKey) return;
        const action =
          typeof userData.action === 'string' ? userData.action : 'play_pause';
        invokeVideoControlById(videoKey, action);
        return;
      }

      if (type === 'Link') {
        const linkKey = key;
        const linkInfo = resolveLinkTarget(linkKey, userData);

        if (linkInfo?.url) {
          const safeUrl = toSafeExternalUrl(linkInfo.url);
          if (!safeUrl) {
            console.warn(`PointerInteractions: blocked unsafe link for "${linkKey}"`);
            return;
          }
          const features = 'noopener=yes,noreferrer=yes';
          const opened = window.open(safeUrl, '_blank', features);
          if (!opened) {
            window.location.href = safeUrl;
          }
        } else {
          console.warn(`PointerInteractions: no link mapped for interactive "${linkKey}"`);
        }
        return;
      }

      if (type && ['Floor', 'Room', 'Wall', 'Walls'].includes(type)) {
        const point = hit.point.clone();
        const localNormal = hit.face?.normal?.clone();
        if (!localNormal) return;
        const normalMatrix = new Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();
        moveVisitor(point, worldNormal, type, movementMode);
      }
    };

    const handleClick = (event: PointerEvent) => {
      if (disabled) return;
      hideHoverTooltip();
      const bounds = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      raycaster.firstHitOnly = true;
      activateHit(pickClickHit(raycaster.ray.origin));
    };

    const resolveVideoControlHitFromCurrentRay = (occlusionOrigin?: Vector3) => {
      const prevFirstHitOnly = raycaster.firstHitOnly;
      raycaster.firstHitOnly = false;
      const intersects = raycaster.intersectObjects(getRaycastTargets().click, false);
      raycaster.firstHitOnly = prevFirstHitOnly;
      if (!intersects.length) return { consumed: false as const };

      let touchedControlRig = false;

      for (const hit of intersects) {
        if (isOccludedByCollider(hit, occlusionOrigin)) continue;
        let node: typeof hit.object | null = hit.object;

        while (node) {
          const userData = node.userData as Record<string, unknown> | undefined;
          if (userData?.__isVideoControlProxy === true) {
            touchedControlRig = true;
          }
          if (userData?.type === 'VideoControl') {
            const videoKey =
              (typeof userData.elementID === 'string' && userData.elementID) ||
              (typeof userData.name === 'string' && userData.name) ||
              node.name;
            const action =
              typeof userData.action === 'string' && userData.action
                ? userData.action
                : 'play_pause';
            let value: number | undefined;
            if (action === 'seek_to') {
              const seekMin = typeof userData.seekMinX === 'number' ? userData.seekMinX : NaN;
              const seekMax = typeof userData.seekMaxX === 'number' ? userData.seekMaxX : NaN;
              if (Number.isFinite(seekMin) && Number.isFinite(seekMax) && seekMax > seekMin) {
                const localPoint = node.worldToLocal(hit.point.clone());
                const ratio = (localPoint.x - seekMin) / (seekMax - seekMin);
                value = Math.min(1, Math.max(0, ratio));
              }
            }
            return {
              consumed: true as const,
              action,
              videoKey,
              value
            };
          }
          node = node.parent;
        }
      }

      // Click landed on control panel/background but not a specific button:
      // consume it so floor/wall teleport doesn't fire through controls.
      if (touchedControlRig) {
        return { consumed: true as const };
      }

      return { consumed: false as const };
    };

    const resolveVideoControlHit = (event: PointerEvent) => {
      const bounds = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);
      return resolveVideoControlHitFromCurrentRay(raycaster.ray.origin);
    };

    const controllerRayOrigin = new Vector3();
    const controllerRayDirection = new Vector3();
    const controllerRotation = new Matrix4();
    const setRayFromController = (controller: Object3D) => {
      controller.updateMatrixWorld(true);
      controllerRayOrigin.setFromMatrixPosition(controller.matrixWorld);
      controllerRotation.extractRotation(controller.matrixWorld);
      controllerRayDirection.set(0, 0, -1).applyMatrix4(controllerRotation).normalize();
      raycaster.set(controllerRayOrigin, controllerRayDirection);
      raycaster.firstHitOnly = true;
    };

    const handleXrSelect = (event: { target?: unknown }) => {
      if (disabled) return;
      hideHoverTooltip();
      const controller = event.target instanceof Object3D ? event.target : null;
      if (!controller) return;
      const suppressUntil =
        typeof controller.userData.__xrHoldRotationSuppressSelectUntil === 'number'
          ? controller.userData.__xrHoldRotationSuppressSelectUntil
          : 0;
      if (suppressUntil > performance.now()) {
        return;
      }

      setRayFromController(controller);
      const rayOrigin = controllerRayOrigin.clone();
      const controlHit = resolveVideoControlHitFromCurrentRay(rayOrigin);
      if (controlHit.consumed) {
        if (controlHit.videoKey && controlHit.action) {
          invokeVideoControlById(controlHit.videoKey, controlHit.action, controlHit.value);
        }
        return;
      }

      activateHit(pickClickHit(rayOrigin, true), 'teleport');
    };

    const onPointerDown = (event: PointerEvent) => {
      if (disabled) {
        hideHoverTooltip();
        return;
      }
      event.preventDefault();
      hideHoverTooltip();
      startCoordsRef.current = { x: event.clientX, y: event.clientY };
      isDraggingRef.current = false;

      const controlHit = resolveVideoControlHit(event);
      if (controlHit.consumed) {
        if (controlHit.videoKey && controlHit.action) {
          invokeVideoControlById(controlHit.videoKey, controlHit.action, controlHit.value);
          if (controlHit.action === 'seek_to') {
            seekDragRef.current.videoKey = controlHit.videoKey;
          } else {
            seekDragRef.current.videoKey = null;
          }
        }
        // Do not forward control clicks into double-tap or teleport flow.
        lastTapRef.current = 0;
        return;
      }

      const now = performance.now();
      const delta = now - lastTapRef.current;
      lastTapRef.current = now;

      if (delta < doubleTapThreshold && !isDraggingRef.current) {
        handleClick(event);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (disabled) {
        hideHoverTooltip();
        return;
      }
      if (seekDragRef.current.videoKey && event.buttons !== 0) {
        const seekHit = resolveVideoControlHit(event);
        if (
          seekHit.consumed &&
          seekHit.action === 'seek_to' &&
          seekHit.videoKey === seekDragRef.current.videoKey &&
          typeof seekHit.value === 'number'
        ) {
          invokeVideoControlById(seekHit.videoKey, 'seek_to', seekHit.value);
        }
        hideHoverTooltip();
        return;
      }

      if (event.buttons !== 0) {
        const { x, y } = startCoordsRef.current;
        if (Math.abs(event.clientX - x) > moveThreshold || Math.abs(event.clientY - y) > moveThreshold) {
          isDraggingRef.current = true;
          hideHoverTooltip();
          return;
        }
      }

      handleHover(event);
    };

    const onPointerUp = () => {
      hideHoverTooltip();
      isDraggingRef.current = false;
      seekDragRef.current.videoKey = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('mouseleave', hideHoverTooltip);
    const xrControllers = [gl.xr.getController(0), gl.xr.getController(1)];
    xrControllers.forEach((controller) => {
      controller.addEventListener('select', handleXrSelect);
    });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('mouseleave', hideHoverTooltip);
      xrControllers.forEach((controller) => {
        controller.removeEventListener('select', handleXrSelect);
      });
    };
  }, [camera, clickIndicator, collider, disabled, gl, imagesMeta, links, objectRegistry, occlusionRaycaster, onCloseSidebar, pathRaycaster, pointer, popupCallback, raycaster, scene, sculpturesMeta, tooltip, videosInteraction, videosMeta, visitor]);

  return null;
}

export default PointerInteractions;
