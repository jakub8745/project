// src/components/Model.tsx
import React, { useRef, useEffect } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import ktx2Loader from '../loaders/ktx2Loader';


export interface ModelProps {
  modelUrl: string;
  overrideScale?: number;
  overridePosition?: [number, number, number];
}

const Model: React.FC<ModelProps> = ({
  modelUrl,
  overrideScale,
  overridePosition,
}) => {
  // grab the WebGLRenderer instance
  const { gl } = useThree();

  // now in the loader callback, detect support *then* hand it to GLTFLoader
  const gltf = useLoader(
    GLTFLoader,
    modelUrl,
    loader => {
      // Draco
      const draco = new DRACOLoader().setDecoderPath('/libs/draco/');
      loader.setDRACOLoader(draco);

      // must detectSupport BEFORE using the loader
      ktx2Loader.detectSupport(gl);
      loader.setKTX2Loader(ktx2Loader);

      

      // meshopt
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
  );

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!ref.current) return;
    const box    = new THREE.Box3().setFromObject(ref.current);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const autoScale = 5 / Math.max(size.x, size.y, size.z);

    ref.current.scale.setScalar(overrideScale ?? autoScale);

    if (overridePosition) {
      ref.current.position.set(...overridePosition);
    } else {
      ref.current.position.copy(center.multiplyScalar(-1));
    }
  }, [gltf.scene, overrideScale, overridePosition]);

  return <group ref={ref}><primitive object={gltf.scene} /></group>;
};

export default Model;
