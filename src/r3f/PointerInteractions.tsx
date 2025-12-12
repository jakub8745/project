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
  sculpturesMeta?: MetaRecord;
  onCloseSidebar?: () => void;
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
  sculpturesMeta = {},
  onCloseSidebar
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

    const validTypes = ['Image', 'Wall', 'visitorLocation', 'Room', 'Floor', 'Video', 'Link'];

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
      const bounds = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      raycaster.firstHitOnly = true;
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((i) => {
        const t = i.object.userData?.type;
        return t === 'Link' || t === 'Image' || t === 'Video' || t === 'Sculpture';
      });

      if (!hit) {
        hideHoverTooltip();
        return;
      }

      const { type, name, elementID } = hit.object.userData || {};
      const key = name || hit.object.name;
      let displayText = '';

      if (type === 'Link') {
        const linkInfo = resolveLinkTarget(key, hit.object.userData as Record<string, unknown>);
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
        const videoInfo = resolveVideoMeta(videoKey, hit.object.userData as Record<string, unknown>);
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
        const sculptureInfo = resolveSculptureMeta(key, hit.object.userData as Record<string, unknown>);
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
      hideHoverTooltip();
      const bounds = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      raycaster.firstHitOnly = true;
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((i) => i.object.userData && validTypes.includes(i.object.userData.type));

      if (!hit || !hit.object.userData) return;

      const { type, elementID, name } = hit.object.userData;

      if (type === 'Image' && popupCallback) {
        const key = name || hit.object.name;
        const meta = key ? imagesMeta?.[key] : undefined;
        popupCallback({
          type,
          key,
          userData: { ...hit.object.userData },
          meta
        });
        return;
      }

      if (type === 'Video') {
        const videoElement = elementID ? document.getElementById(elementID) : null;

        if (videoElement instanceof HTMLVideoElement) {
          videoElement.muted = false;
          if (videoElement.paused) {
            videoElement.play().catch((err) => console.warn("Couldn't autoplay:", err));
          } else {
            videoElement.pause();
          }
        }
        return;
      }

      if (type === 'Link') {
        const linkKey = name || hit.object.name;
        const linkInfo = resolveLinkTarget(linkKey, hit.object.userData as Record<string, unknown>);

        if (linkInfo?.url) {
          const features = 'noopener=yes,noreferrer=yes';
          const opened = window.open(linkInfo.url, '_blank', features);
          if (!opened) {
            window.location.href = linkInfo.url;
          }
        } else {
          console.warn(`PointerInteractions: no link mapped for interactive "${linkKey}"`);
        }
        return;
      }

      if (['Floor', 'Room', 'Wall'].includes(type)) {
        const point = hit.point.clone();
        const localNormal = hit.face?.normal?.clone();
        if (!localNormal) return;
        const normalMatrix = new Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();
        placeClickIndicator(point, worldNormal);
        moveVisitor(point);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      hideHoverTooltip();
      startCoordsRef.current = { x: event.clientX, y: event.clientY };
      isDraggingRef.current = false;

      const now = performance.now();
      const delta = now - lastTapRef.current;
      lastTapRef.current = now;

      if (delta < doubleTapThreshold && !isDraggingRef.current) {
        handleClick(event);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
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
  }, [camera, clickIndicator, gl, imagesMeta, links, onCloseSidebar, pointer, popupCallback, raycaster, scene, sculpturesMeta, tooltip, videosMeta, visitor]);

  return null;
}

export default PointerInteractions;
