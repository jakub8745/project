
  const { orbit, transform } = initControls(camera, renderer.domElement, {
    onChange: () => renderer.render(scene, camera),
  });

  const targetObj = findByUserDataType(scene, "Pitcher");

  if (targetObj) {
    scene.add(transform);       
    transform.attach(targetObj); 
    transform.setMode('rotate'); // or 'translate' | 'scale'
  } else {
    console.warn('No object with userData.type === "Pitcher" found.');
  }