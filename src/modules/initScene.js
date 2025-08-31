// src/modules/initScene.js
import { Scene, Color, EquirectangularReflectionMapping, SRGBColorSpace, AmbientLight } from 'three';

export default function initScene(backgroundTexture, ktx2Loader, name, backgroundBlurriness, backgroundIntensity, lightIntensity) {
  const scene = new Scene();
  scene.background = new Color(0xffffff); // fallback background


  console.log('🎨 Scene in');




  if (backgroundTexture) {
    ktx2Loader.load(backgroundTexture, (texture) => {
      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = SRGBColorSpace;
      //texture.offset.x = 0.5;
      scene.background = texture;
      scene.backgroundBlurriness = backgroundBlurriness || 0;
      scene.backgroundIntensity = backgroundIntensity || 1;

    });
  }

  //scene.name = name
  scene.add(new AmbientLight(0xffffff, lightIntensity || 2));


  return scene;
}
