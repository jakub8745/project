// src/modules/createMapRenderer.js
import {
    WebGLRenderer,
    ACESFilmicToneMapping,
    SRGBColorSpace
  } from 'three';
  
  export default function initMapRenderer({
    width = 500,
    height = 500,
    clearColor = 0x142236
  } = {}) {
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
  
    // map doesn’t need high-dpi
    renderer.setPixelRatio(1);
    renderer.setSize(width, height);
  
    // if you don’t need shadows on the minimap, disable:
    renderer.shadowMap.enabled = false;
  
    renderer.setClearColor(clearColor);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    console.log('renderer', renderer)
  
    return renderer;
  }
  