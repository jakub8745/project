import { useCallback, useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Vector3Tuple } from 'three';
import type { PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';

export type ThumbnailCaptureConfig = {
  enabled: boolean;
  cameraPosition: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
  allowOrbit: boolean;
  heightStep: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  showHint: boolean;
  fps: number;
  mimeType: string;
  bitsPerSecond: number;
  filename: string;
  preset?: string;
};

export function ThumbnailRecorderMode({
  config,
  active
}: {
  config: ThumbnailCaptureConfig;
  active: boolean;
}) {
  const { gl } = useThree();
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | undefined;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const applyCameraPose = useCallback(() => {
    let pose = {
      cameraPosition: config.cameraPosition,
      target: config.target,
      fov: config.fov
    };
    if (config.preset === 'lockdownsPoster') {
      pose = {
        cameraPosition: [-12.5, 11.5, 10.2],
        target: [0.6, 1.1, -1.4],
        fov: 34
      };
    }
    camera.position.set(...pose.cameraPosition);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...pose.target);
      controls.enabled = config.allowOrbit;
      controls.update();
    }
  }, [camera, config.allowOrbit, config.cameraPosition, config.fov, config.preset, config.target, controls]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(() => {
    if (typeof window === 'undefined') return;
    const mediaStream = gl.domElement.captureStream(config.fps);
    const recorder = new MediaRecorder(mediaStream, {
      mimeType: config.mimeType,
      videoBitsPerSecond: config.bitsPerSecond
    });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      setIsRecording(false);
      const blob = new Blob(chunksRef.current, { type: config.mimeType });
      chunksRef.current = [];
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = config.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      mediaStream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
    };
    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
  }, [config.bitsPerSecond, config.filename, config.fps, config.mimeType, gl.domElement]);

  useEffect(() => {
    if (!active || !config.enabled) {
      stopRecording();
      if (controls) controls.enabled = true;
      return;
    }
    applyCameraPose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k') {
        applyCameraPose();
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      }
      const raiseKeys = new Set(['PageUp', 'q', 'Q', ']', '=', '+']);
      const lowerKeys = new Set(['PageDown', 'e', 'E', '[', '-', '_']);
      if (raiseKeys.has(event.key) || lowerKeys.has(event.key)) {
        event.preventDefault();
        const dir = raiseKeys.has(event.key) ? 1 : -1;
        camera.position.y += dir * config.heightStep;
        if (controls) {
          controls.target.y += dir * config.heightStep * 0.35;
          controls.update();
        }
      }
      if (event.key.toLowerCase() === 'p') {
        const payload = {
          cameraPosition: [camera.position.x, camera.position.y, camera.position.z].map((n) => Number(n.toFixed(3))),
          target: controls
            ? [controls.target.x, controls.target.y, controls.target.z].map((n) => Number(n.toFixed(3)))
            : [0, 0, 0],
          fov: Number(camera.fov.toFixed(3))
        };
        console.log('thumbnailCapture camera snapshot', payload);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      stopRecording();
      if (controls) controls.enabled = true;
    };
  }, [active, applyCameraPose, camera, config.enabled, config.heightStep, controls, isRecording, startRecording, stopRecording]);

  if (!active || !config.enabled || !config.showHint) return null;

  return (
    <Html position={[0, 0, 0]} center>
      <div className="pointer-events-none rounded-md bg-black/60 px-2 py-1 text-xs text-white">
        Thumbnail mode: `K` reset, `R` record, `PgUp/PgDn` or `Q/E` height, `P` print pose {isRecording ? '(REC)' : ''}
      </div>
    </Html>
  );
}
