import {
  AudioLoader,
  PositionalAudio,
  MathUtils
} from 'three';
import { PositionalAudioHelper } from 'three/examples/jsm/helpers/PositionalAudioHelper.js';

let audioButtonCreated = false; // global guard

export function createAudioMeshes(root, listener, audioObjectsArray = []) {
  const loader = new AudioLoader();

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

        // const helper = new PositionalAudioHelper(sound, refDist * 2);
        // sound.add(helper);

        mesh.add(sound);
        audioObjectsArray.push(sound);

        console.log(`🔊 PositionalAudio added to ${mesh.name || mesh.uuid}`);

        // Create button only once
        if (!audioButtonCreated) {
          createAudioToggleButton(audioObjectsArray);
          audioButtonCreated = true;
        }
      });

      mesh.scale.setScalar(0.1);
      mesh.rotateX(Math.PI / 2);
      mesh.rotation.y += MathUtils.degToRad(120);
    }
  });

  return audioObjectsArray;
}

function createAudioToggleButton(audioObjects) {
  const btn = document.createElement('button');
  btn.innerHTML = '🔈';
  btn.setAttribute('aria-label', 'Toggle audio');

  Object.assign(btn.style, {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: '9999',
    padding: '10px 14px',
    fontSize: '20px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  });

  let isPlaying = false;

  btn.addEventListener('click', () => {
    if (!audioObjects.length) return;

    isPlaying = !isPlaying;
    btn.innerHTML = isPlaying ? '⏸️' : '🔈';

    audioObjects.forEach(audio => {
      if (isPlaying && !audio.isPlaying) {
        audio.play();
      } else if (!isPlaying && audio.isPlaying) {
        audio.pause();
      }
    });
  });

  document.body.appendChild(btn);
}
