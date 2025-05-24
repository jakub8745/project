// src/modules/initScene.js
import { Scene, Color, EquirectangularReflectionMapping, SRGBColorSpace } from 'three';

export default function initScene(backgroundTexture, ktx2Loader, name) {
  const scene = new Scene();
  scene.background = new Color(0xffffff); // fallback background

  if (backgroundTexture) {
    ktx2Loader.load(backgroundTexture, (texture) => {
      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = SRGBColorSpace;
      scene.background = texture;
    });
  }

  //scene.name = name

  return scene;
}
