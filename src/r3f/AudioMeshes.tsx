import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { AudioListener } from 'three';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  applyAudioMeshes as applyAudioMeshesToScene,
  disposeAudioMeshes,
  type AudioMeshConfig
} from '../modules/audioMeshManager.ts';

interface AudioMeshesProps {
  audioConfig?: AudioMeshConfig[];
  listener: AudioListener;
  transform?: TransformControls;
  ready: boolean;
  sceneVersion?: number;
  enableHelpers?: boolean;
}

export function AudioMeshes({
  audioConfig,
  listener,
  transform,
  ready,
  sceneVersion,
  enableHelpers = false
}: AudioMeshesProps) {
  const { scene, gl, camera } = useThree();

  useEffect(() => {
    if (!ready || !audioConfig || audioConfig.length === 0) {
      disposeAudioMeshes();
      return;
    }

    applyAudioMeshesToScene({
      scene,
      galleryConfig: { audio: audioConfig },
      listener,
      renderer: gl,
      camera,
      transform,
      enableHelpers
    });

    return () => {
      disposeAudioMeshes();
    };
  }, [audioConfig, ready, scene, listener, gl, camera, transform, enableHelpers, sceneVersion]);

  return null;
}

export default AudioMeshes;
