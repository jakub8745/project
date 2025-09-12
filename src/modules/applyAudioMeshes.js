// modules/applyAudioMeshes.js
import { AudioLoader, PositionalAudio, MathUtils } from 'three';
import { PositionalAudioHelper } from 'three/examples/jsm/helpers/PositionalAudioHelper.js';
import { applyPitcherControls } from './applyPitcherControls.js';



let audioButton;            // shared UI button
let audioObjectsRef = [];   // keep track of active sounds
let isAudioPlaying = false;

export function disposeAudioMeshes() {
  audioObjectsRef.forEach(sound => {
    if (sound.isPlaying) sound.stop();
    sound.disconnect();
    sound.parent?.remove(sound);
  });
  audioObjectsRef = [];
}


//export function applyAudioMeshes(scene, galleryConfig, listener) {
export function applyAudioMeshes(scene, galleryConfig, listener, renderer, camera, transform) {

  const loader = new AudioLoader();
  const ipfsGateways = [
    'https://cloudflare-ipfs.com/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://dweb.link/ipfs/'
  ];

  function loadAudioWithFallback(cfg, onSuccess) {
    const primary = cfg?.url || '';
    const ipfsUrl = cfg?.ipfsUrl || (typeof primary === 'string' && primary.startsWith('ipfs://') ? primary : null);

    const tryIpfs = (gwIndex = 0) => {
      if (!ipfsUrl) {
        console.error(`[AudioMesh] Primary failed and no IPFS fallback for ${cfg?.id || cfg?.name}`);
        return;
      }
      if (gwIndex >= ipfsGateways.length) {
        console.error(`[AudioMesh] Failed to load audio from all gateways: ${ipfsUrl}`);
        return;
      }
      const cid = ipfsUrl.replace('ipfs://', '');
      const url = ipfsGateways[gwIndex] + cid;
      loader.load(
        url,
        buffer => onSuccess(buffer),
        undefined,
        () => {
          console.warn(`[AudioMesh] IPFS gateway failed (${gwIndex + 1}/${ipfsGateways.length}), retrying...`);
          tryIpfs(gwIndex + 1);
        }
      );
    };

    const tryPrimary = () => {
      // If primary is ipfs://, go straight to IPFS
      if (typeof primary === 'string' && primary.startsWith('ipfs://')) {
        tryIpfs(0);
        return;
      }
      if (!primary) {
        tryIpfs(0);
        return;
      }
      loader.load(
        primary,
        buffer => onSuccess(buffer),
        undefined,
        () => {
          console.warn(`[AudioMesh] Primary failed, falling back to IPFS: ${primary}`);
          tryIpfs(0);
        }
      );
    };

    tryPrimary();
  }

  // build config map for quick lookup
  const configMap = new Map((galleryConfig.audio || []).map(cfg => [cfg.id, cfg]));

  // cleanup previous sounds
  audioObjectsRef.forEach(sound => {
    if (sound.isPlaying) sound.stop();
    sound.disconnect();
    sound.parent?.remove(sound);
  });
  audioObjectsRef = [];

  let foundAny = false;

  scene.traverse(obj => {

    //console.log(obj);
    if (obj.userData.type === 'Audio' || obj.userData.type === 'Pitcher') {
      const cfg = configMap.get(obj.userData.name);
      if (!cfg) {
        console.warn(`No audio config for ID ${obj.userData.name}`);
        return;
      }



      console.log("dodawane audio", cfg, obj.userData.name);

      foundAny = true;

      const sound = new PositionalAudio(listener);
      sound.name = cfg.name || obj.userData.name || obj.name;

      loadAudioWithFallback(cfg, buffer => {
        sound.setBuffer(buffer);
        sound.setLoop(cfg.loop ?? true);
        sound.setRefDistance(cfg.refDistance ?? 1);
        sound.setRolloffFactor(cfg.rolloff ?? 1);
        sound.setMaxDistance(cfg.maxDistance ?? 5);
        sound.setDistanceModel(cfg.distanceModel ?? 'linear');
        sound.setVolume(cfg.volume ?? 1);
        if (Array.isArray(cfg.directionalCone)) {
          sound.setDirectionalCone(...cfg.directionalCone);
        }


        // Optional: visualize cone
        //const helper = new PositionalAudioHelper(sound, (cfg.refDistance ?? 1) * 2);
        //sound.add(helper);

        obj.add(sound);
        audioObjectsRef.push(sound);

        console.log(`🔊 PositionalAudio added to ${obj.name || obj.uuid}`);
      });

      // give audio meshes a little marker transform
      obj.scale.setScalar(0.1);
      obj.rotateX(Math.PI / 2);
      obj.rotation.y += MathUtils.degToRad(120);
    }

    if (obj.userData.type === 'Pitcher' && transform) {
        console.log('🎨 ...renderer:', renderer)  ;

      applyPitcherControls(obj, scene, renderer, camera, transform);
    }



  });

  updateAudioToggleButton(foundAny, audioObjectsRef);
}

// --- UI button logic (unchanged) ---
function updateAudioToggleButton(audioAvailable) {
  if (!audioButton) {
    audioButton = document.createElement('img');
    audioButton.id = 'audio-control-button';
    audioButton.src = '/icons/ButtonPlay.png';

    Object.assign(audioButton.style, {
      position: 'absolute',
      top: '20px',
      right: '20px',
      zIndex: '29',
      width: '48px',
      height: '48px',
      borderRadius: '8px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      display: 'none',
    });

    audioButton.addEventListener('click', async () => {
      if (!audioObjectsRef.length) return;

      const ctx = audioObjectsRef[0].context;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      console.log('🎵 audio button click', audioObjectsRef, isAudioPlaying);

      isAudioPlaying = !isAudioPlaying;
      audioButton.src = isAudioPlaying ? '/icons/ButtonPause.png' : '/icons/ButtonPlay.png';

      audioObjectsRef.forEach(audio => {
        if (isAudioPlaying && !audio.isPlaying) {
          audio.play();
        } else if (!isAudioPlaying && audio.isPlaying) {
          audio.pause();
        }
      });
    });

    document.body.appendChild(audioButton);
  }

  // 🔧 always reset state on scene (re)load
  isAudioPlaying = false;
  audioButton.src = '/icons/ButtonPlay.png';

  if (audioAvailable) {
    audioButton.style.display = 'block';
  } else {
    audioButton.style.display = 'none';
  }
}
