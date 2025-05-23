// src/modules/createAudioMeshes.js
import {
  AudioLoader,
  PositionalAudio,
  MathUtils
} from 'three';
import { PositionalAudioHelper } from 'three/examples/jsm/helpers/PositionalAudioHelper.js';

export function createAudioMeshes(root, listener, audioObjectsArray = []) {
  const loader = new AudioLoader();

  // Traverse the graph looking for meshes flagged for audio
  root.traverse(mesh => {
    if (mesh.isMesh && mesh.userData.type === 'Audio') {

        
      const url       = mesh.userData.audio;
      const refDist   = mesh.userData.audioRefDistance  || 1;
      const rolloff   = mesh.userData.audioRolloffFactor || 1;
      const volume    = mesh.userData.audioVolume       || 1;

      const sound = new PositionalAudio(listener);
      sound.name = mesh.userData.name;

      loader.load(url, buffer => {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setRefDistance(refDist);
        sound.setRolloffFactor(rolloff);
        sound.setVolume(volume);
        sound.setDirectionalCone(10, 23, 0.1);

        // optional helper for debugging
        // const helper = new PositionalAudioHelper(sound, refDist * 2);
        // sound.add(helper);

        mesh.add(sound);
        audioObjectsArray.push(sound);

        console.log(`🔊 PositionalAudio added to ${mesh.name || mesh.uuid}`);
      });

      // If your mesh needs an initial transform just for the helper/visual:
      mesh.scale.setScalar(0.1);
      mesh.rotateX(Math.PI / 2);
      mesh.rotation.y += MathUtils.degToRad(120);
    }
  });

  return audioObjectsArray;
}
