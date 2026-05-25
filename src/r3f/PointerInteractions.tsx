import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Raycaster,
  Vector2,
  Vector3,
  Mesh,
  MeshBasicMaterial,
  CircleGeometry,
  DoubleSide,
  Quaternion,
  Matrix3
} from 'three';
import { createTooltip } from '../modules/Tooltip.js';
import type Visitor from '../modules/Visitor';
import { toSafeExternalUrl } from '../utils/url';
import { invokeVideoControlById, openVideoPlayerById, resumeVideoAudioById } from '../modules/applyVideoMeshes.js';
import type { VideoPlaybackMode } from '../modules/videoPlaybackMode.js';
import { resolveObjectRuntimeData, type ObjectRegistry } from '../modules/objectRegistry.js';

type MetaRecord = Record<string, Record<string, unknown>>;

export interface PointerPopupPayload {
  type: string;
  key: string;
  userData: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface PointerInteractionsProps {
  visitor: Visitor | null;
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

export function PointerInteractions({
  visitor,
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
  const pointer = useMemo(() => new Vector2(), []);
  const clickIndicator = useMemo(() => createClickIndicator(), []);
  const tooltip = useMemo(() => createTooltip(), []);

  const moveThreshold = 5;
  const doubleTapThreshold = 300;

  const isDraggingRef = useRef(false);
  const startCoordsRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const seekDragRef = useRef<{ videoKey: string | null }>({ videoKey: null });

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
    if (!visitor) return undefined;

    const canvas = gl.domElement;

    const validTypes = ['Image', 'Wall', 'Walls', 'visitorLocation', 'Room', 'Floor', 'Video', 'VideoControl', 'Link'];

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
        runtimeData?.ref ||
        (typeof userData.name === 'string' ? userData.name : undefined) ||
        object.name;
      const elementID =
        typeof userData.elementID === 'string'
          ? userData.elementID
          : runtimeData?.type === 'Video' || runtimeData?.type === 'VideoControl'
            ? runtimeData.ref
            : undefined;
      return { type, key, elementID, userData };
    };

    const hideHoverTooltip = () => {
      tooltip.hide();
    };

    const placeClickIndicator = (point: Vector3, worldNormal: Vector3) => {
      const offsetPos = point.clone().addScaledVector(worldNormal, 0.02);
      clickIndicator.position.copy(offsetPos);
      const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), worldNormal);
      clickIndicator.setRotationFromQuaternion(quat);
      clickIndicator.visible = true;
    };

    const moveVisitor = (point: Vector3) => {
      visitor.target = point.clone();
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
      const title = (typeof meta.title === 'string' && meta.title) || imageKey;
      const author = (typeof meta.author === 'string' && meta.author) || '';
      return { title, author };
    };

    const resolveVideoMeta = (videoKey: string, userData: Record<string, unknown> = {}) => {
      const meta = videosMeta?.[videoKey];
      if (!meta && !userData) return null;
      const title =
        (meta?.title as string | undefined) ||
        (userData?.title as string | undefined) ||
        (userData?.name as string | undefined) ||
        videoKey;
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

    const resolveSculptureMeta = (sculptureKey: string, userData: Record<string, unknown> = {}) => {
      const meta = sculpturesMeta?.[sculptureKey];
      if (!meta && !userData) return null;
      const title =
        (meta?.title as string | undefined) ||
        (userData?.title as string | undefined) ||
        (userData?.name as string | undefined) ||
        sculptureKey;
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
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((i) => {
        const t = resolveHitRuntime(i.object as Mesh).type;
        return t === 'Link' || t === 'Image' || t === 'Video' || t === 'Sculpture';
      });

      if (!hit) {
        hideHoverTooltip();
        return;
      }

      const { type, key, elementID, userData } = resolveHitRuntime(hit.object as Mesh);
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
        displayText = parts.length ? parts.join(' — ') : videoKey;
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
        displayText = parts.length ? parts.join(' — ') : key;
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

    const handleClick = (event: PointerEvent) => {
      if (disabled) return;
      hideHoverTooltip();
      const bounds = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      raycaster.firstHitOnly = true;
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((i) => {
        const { type } = resolveHitRuntime(i.object as Mesh);
        return Boolean(type && validTypes.includes(type));
      });

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
        const interactionCfg = videoKey ? videosInteraction?.[videoKey] : undefined;
        if (interactionCfg?.interactive === false) {
          return;
        }
        const playbackMode = interactionCfg?.playbackMode ?? 'direct_modal';
        if (playbackMode === 'synced_silent') {
          return;
        }
        const opened = playbackMode !== 'synced_silent' ? openVideoPlayerById(videoKey) : false;
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

      if (['Floor', 'Room', 'Wall', 'Walls'].includes(type)) {
        const point = hit.point.clone();
        const localNormal = hit.face?.normal?.clone();
        if (!localNormal) return;
        const normalMatrix = new Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();
        placeClickIndicator(point, worldNormal);
        moveVisitor(point);
      }
    };

    const resolveVideoControlHit = (event: PointerEvent) => {
      const bounds = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);
      const prevFirstHitOnly = raycaster.firstHitOnly;
      raycaster.firstHitOnly = false;
      const intersects = raycaster.intersectObjects(scene.children, true);
      raycaster.firstHitOnly = prevFirstHitOnly;
      if (!intersects.length) return { consumed: false as const };

      let touchedControlRig = false;

      for (const hit of intersects) {
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

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('mouseleave', hideHoverTooltip);
    };
  }, [camera, clickIndicator, disabled, gl, imagesMeta, links, objectRegistry, onCloseSidebar, pointer, popupCallback, raycaster, scene, sculpturesMeta, tooltip, videosInteraction, videosMeta, visitor]);

  return null;
}

export default PointerInteractions;
