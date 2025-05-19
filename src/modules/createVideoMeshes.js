// src/modules/createVideoMeshes.js
import {
    PlaneGeometry,
    VideoTexture,
    MeshBasicMaterial,
    Mesh,
    DoubleSide,
    SRGBColorSpace,
    Vector3,
    TextureLoader
} from 'three';

const PLAY_ICON_PATH = 'https://bafybeieawhqdesjes54to4u6gmqwzvpzlp2o5ncumaqw3nfiv2mui6i6q4.ipfs.w3s.link/ButtonPlay.png';

export function createVideoMeshes(scene) {
    scene.traverse(object => {
        if (object.isMesh && object.userData.type === "Video") {
            const videoId = object.userData.elementID;
            const video = document.getElementById(videoId);

            if (!video) {
                console.warn(`⚠️ No <video> element found with ID: ${videoId}`);
                return;
            }

            video.muted = true;
            video.currentTime = 0.01;

            const aspect = video.videoWidth / video.videoHeight || 1.77;
            const geometry = new PlaneGeometry(aspect, 1);
            const texture = new VideoTexture(video);
            texture.colorSpace = SRGBColorSpace;

            const material = new MeshBasicMaterial({
                map: texture,
                side: DoubleSide
            });

            const newMesh = new Mesh(geometry, material);
            newMesh.name = `videoMesh_${videoId}`;
            newMesh.userData = { type: "Video", elementID: videoId };

            // Set transform
            const offset = new Vector3(-0.05, -0.65, -2.4);
            newMesh.position.copy(object.position.clone().add(offset));
            newMesh.scale.set(-3.8, 3.6, 1);
            newMesh.rotation.y = Math.PI / 2;

            // ---- PLAY ICON SETUP ----
            const iconSize = 0.2; // adjust to taste

            const textureLoader = new TextureLoader();
            const playIconTexture = textureLoader.load(PLAY_ICON_PATH);
            
            const iconGeo = new PlaneGeometry(iconSize, iconSize);
            const iconMat = new MeshBasicMaterial({
              map: playIconTexture,
              transparent: true,
              side: DoubleSide
            });
            const iconMesh = new Mesh(iconGeo, iconMat);
            iconMesh.name = `playIcon_${videoId}`;
            
            // Position icon in front of video plane
            iconMesh.position.set(0, 0, -0.01);
            
            // Add the icon to your newMesh (or whatever parent object)
            newMesh.add(iconMesh);
            

            video.addEventListener('play', () => { iconMesh.visible = false; });
            video.addEventListener('pause', () => { iconMesh.visible = true; });
            video.addEventListener('ended', () => { iconMesh.visible = true; });

            scene.add(newMesh);
            console.log(`🎬 Added video mesh for #${videoId}`);
        }
    });
}
