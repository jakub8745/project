import { NodeIO } from '/Users/dystopiaimitation/.npm-global/lib/node_modules/@gltf-transform/cli/node_modules/@gltf-transform/core/dist/index.modern.js';
import { ALL_EXTENSIONS } from '/Users/dystopiaimitation/.npm-global/lib/node_modules/@gltf-transform/cli/node_modules/@gltf-transform/extensions/dist/index.modern.js';
import { mergeDocuments, prune, unpartition } from '/Users/dystopiaimitation/.npm-global/lib/node_modules/@gltf-transform/cli/node_modules/@gltf-transform/functions/dist/functions.modern.js';
import draco3d from '/Users/dystopiaimitation/.npm-global/lib/node_modules/@gltf-transform/cli/node_modules/draco3dgltf/draco3dgltf.js';

const [interiorPath, templatePath, outputPath] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});
const interior = await io.read(interiorPath);
const template = await io.read(templatePath);

const interiorRoot = interior.getRoot();
const templateRoot = template.getRoot();
const interiorScene = interiorRoot.listScenes()[0];
const templateScene = templateRoot.listScenes()[0];
interiorScene.setName('exhibition_cipriani_merged');

// Keep the template's interactive hierarchy, but discard its five old room nodes.
const templateBaseNames = new Set([
  'PodlogaSchodyPodest',
  'Wall_nowaSala',
  'Wall_5kat.001',
  'Wall_fotografie_salaSchodow.baked',
  'Circle'
]);
for (const child of [...templateScene.listChildren()]) {
  if (templateBaseNames.has(child.getName())) {
    templateScene.removeChild(child);
    child.dispose();
  }
}

// Add the preserved interactive hierarchy to the new interior document.
await mergeDocuments(interior, template);
const mergedScenes = interiorRoot.listScenes();
const preservedScene = mergedScenes[mergedScenes.length - 1];
for (const child of [...preservedScene.listChildren()]) {
  preservedScene.removeChild(child);
  interiorScene.addChild(child);
}
preservedScene.dispose();
interiorRoot.setDefaultScene(interiorScene);

await interior.transform(prune(), unpartition());
await io.write(outputPath, interior);
