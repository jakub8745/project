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



const PLAY_ICON_PATH =
    'https://bafybeieawhqdesjes54to4u6gmqwzvpzlp2o5ncumaqw3nfiv2mui6i6q4.ipfs.w3s.link/ButtonPlay.png';

export function createVideoMeshes(scene, galleryConfig) {
    // pre-build a map of your video configs by id
    const videoMap = new Map(
        (galleryConfig.videos || []).map(cfg => [cfg.id, cfg])
    );

    scene.traverse(object => {
        if (object.isMesh && object.userData.type === 'Video') {
            const videoId = object.userData.elementID;
            let video = document.getElementById(videoId);

            // if it isn't already in the DOM, but _is_ in your config, build it
            if (!video && videoMap.has(videoId)) {
                const cfg = videoMap.get(videoId);

                video = document.createElement('video');
                video.id = videoId;
                video.loop = !!cfg.loop || true;
                video.muted = !!cfg.muted || true;
                video.playsInline = !!cfg.playsinline;
                video.preload = cfg.preload || 'auto';
                video.crossOrigin = 'anonymous';

                //video.autoplay = true;

                console.log(cfg, video.loop, video.muted, video.playsInline);
                // add each source

                cfg.sources.forEach(srcObj => {
                    const s = document.createElement('source');
                    // turn the ipfs:// URI into an HTTP gateway URL…
                    const uri = srcObj.src.startsWith('ipfs://')
                        ? srcObj.src.replace('ipfs://', 'https://ipfs.io/ipfs/')
                        : srcObj.src;
                    s.src = uri;
                    s.type = srcObj.type;
                    video.appendChild(s);
                });
                video.load();
                document.body.appendChild(video);

            }

            if (!video) {
                console.warn(`⚠️ No video config or element for ID ${videoId}`);
                return;
            }

            // now you can treat it just like before
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
            newMesh.userData = { type: 'Video', elementID: videoId };

            // transform your mesh
            const offset = new Vector3(-0.05, -0.65, -2.4);
            newMesh.position.copy(object.position.clone().add(offset));
            newMesh.scale.set(-3.8, 3.6, 1);
            newMesh.rotation.y = Math.PI / 2;

            // play-icon overlay
            const iconSize = 0.2;
            const texLoader = new TextureLoader();
            const playIconTexture = texLoader.load(PLAY_ICON_PATH);

            const iconGeo = new PlaneGeometry(iconSize, iconSize);
            const iconMat = new MeshBasicMaterial({
                map: playIconTexture,
                transparent: true,
                side: DoubleSide
            });
            const iconMesh = new Mesh(iconGeo, iconMat);
            iconMesh.name = `playIcon_${videoId}`;
            iconMesh.position.set(0, 0, -0.01);
            newMesh.add(iconMesh);

            // icon visibility toggles
            video.addEventListener('play', () => (iconMesh.visible = false));
            video.addEventListener('pause', () => (iconMesh.visible = true));
            video.addEventListener('ended', () => (iconMesh.visible = true));

            scene.add(newMesh);
            console.log(`🎬 Added video mesh for #${videoId}`, video);
        }
    });
}
