import {
  AudioLoader,
  PositionalAudio,
  MathUtils
} from 'three';
import { PositionalAudioHelper } from 'three/examples/jsm/helpers/PositionalAudioHelper.js';

let audioButton;            // Shared button
let audioObjectsRef = [];   // Last audio objects

export function createAudioMeshes(root, listener, audioObjectsArray = []) {
  const loader = new AudioLoader();
  let currentAudioFound = false;

  // Cleanup old sounds
  audioObjectsRef.forEach(sound => {
    if (sound.isPlaying) sound.stop();
    sound.disconnect(); // stop audio node
    sound.parent?.remove(sound);
  });
  audioObjectsRef = [];

  root.traverse(mesh => {
    if (mesh.isMesh && mesh.userData.type === 'Audio') {
      currentAudioFound = true;

      const url = mesh.userData.audio;
      const refDist = mesh.userData.audioRefDistance || 1;
      const rolloff = mesh.userData.audioRolloffFactor || 1;
      const volume = mesh.userData.audioVolume || 1;

      const sound = new PositionalAudio(listener);
      sound.name = mesh.userData.name;

      loader.load(url, buffer => {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setRefDistance(refDist);
        sound.setRolloffFactor(rolloff);
        sound.setVolume(volume);
        sound.setDirectionalCone(10, 23, 0.1);

        // Optionally: const helper = new PositionalAudioHelper(sound, refDist * 2);
        // sound.add(helper);

        mesh.add(sound);
        audioObjectsArray.push(sound);
        audioObjectsRef.push(sound);

        console.log(`🔊 PositionalAudio added to ${mesh.name || mesh.uuid}`);
      });

      mesh.scale.setScalar(0.1);
      mesh.rotateX(Math.PI / 2);
      mesh.rotation.y += MathUtils.degToRad(120);
    }
  });

  updateAudioToggleButton(currentAudioFound, audioObjectsRef);

  return audioObjectsArray;
}

let isAudioPlaying = false;

function updateAudioToggleButton(audioAvailable, audioObjects) {
  if (!audioButton) {
    // Create the button once
    audioButton = document.createElement('img');
    audioButton.id = 'audio-control-button';
    audioButton.src = '/icons/ButtonPlay.png';

    Object.assign(audioButton.style, {
      position: 'absolute',
      top: '20px',
      right: '20px',
      zIndex: '9999',
      width: '48px',
      height: '48px',
      borderRadius: '8px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      display: 'none',
    });

    audioButton.addEventListener('click', () => {
      if (!audioObjects.length) return;

      isAudioPlaying = !isAudioPlaying;
      audioButton.src = isAudioPlaying ? '/icons/ButtonPause.png' : '/icons/ButtonPlay.png';

      audioObjects.forEach(audio => {
        if (isAudioPlaying && !audio.isPlaying) {
          audio.play();
        } else if (!isAudioPlaying && audio.isPlaying) {
          audio.pause();
        }
      });
    });

    document.body.appendChild(audioButton);
  }

  if (audioAvailable) {
    audioButton.style.display = 'block';
  } else {
    audioButton.style.display = 'none';
    isAudioPlaying = false;
    audioButton.src = '/icons/ButtonPlay.png'; // Reset icon to play
  }
}

