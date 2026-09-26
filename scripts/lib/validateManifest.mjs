import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
const schema = JSON.parse(readFileSync(new URL('../../public/configs/schemas/exhibit_manifest_v3.schema.json', import.meta.url), 'utf8'));
const validateSchema = new Ajv2020({ allErrors:true, strict:false }).compile(schema);

export function validateManifest(manifest) {
  const errors = [];
  const warnings = [];
  if (!validateSchema(manifest)) return { errors:validateSchema.errors.map((error) => `${error.instancePath || '/'} ${error.message}`), warnings };
  const { assets, content, sceneGraph:graph } = manifest;
  const media = content.media || {};
  const viewer = graph.viewerProfiles?.r3fCurrent || {};
  const targets = new Set(['visitor', ...Object.keys(graph.nodes), ...Object.keys(viewer.physics?.actors || {}), ...(viewer.models || []).map((entry) => entry.id), ...(viewer.proceduralObjects || []).map((entry) => entry.id)]);
  function assetRef(id, at) { if (typeof id === 'string' && !assets[id]) errors.push(`${at}: unknown asset ${id}`); }
  function mediaRef(id, at) { if (typeof id === 'string' && !media[id]) errors.push(`${at}: unknown media ${id}`); }
  function targetRef(id, at) { if (!targets.has(id)) warnings.push(`${at}: ${id} is not declared; verify the GLB node or runtime alias`); }
  function walk(value, at) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((entry,index) => walk(entry,`${at}[${index}]`)); return; }
    for (const [key,entry] of Object.entries(value)) {
      if (key === 'asset' || ['backgroundAsset','environmentAsset','iconAsset','systemPromptAsset'].includes(key)) assetRef(entry,`${at}.${key}`);
      else if (key === 'subtitles' && Array.isArray(entry)) entry.forEach((id) => assetRef(id,`${at}.${key}`));
      walk(entry,`${at}.${key}`);
    }
  }
  walk(content,'content'); walk(graph,'sceneGraph'); walk(manifest.metadata,'metadata');
  for (const [id,asset] of Object.entries(assets)) {
    if (asset.id !== id) errors.push(`assets.${id}: id must equal registry key`);
    if (!asset.ipfsUri || !asset.sha256 || !asset.rights) warnings.push(`assets.${id}: preservation/rights verification pending`);
  }
  for (const [id,node] of Object.entries(graph.nodes)) mediaRef(node.media,`sceneGraph.nodes.${id}.media`);
  for (const [moduleId,module] of Object.entries(graph.modules || {})) {
    for (const instance of module.instances || []) {
      mediaRef(instance.media,`modules.${moduleId}.${instance.id}`);
      targetRef(instance.targetNode,`modules.${moduleId}.${instance.id}`);
    }
  }
  const ids = new Set();
  for (const entry of manifest.interactions) {
    if (ids.has(entry.id)) errors.push(`Duplicate interaction ID: ${entry.id}`);
    ids.add(entry.id);
    mediaRef(entry.media,`interactions.${entry.id}`);
    mediaRef(entry.action?.media,`interactions.${entry.id}.action`);
    for (const target of entry.targets || []) targetRef(target,`interactions.${entry.id}`);
  }
  for (const entry of content.sidebar?.items || []) {
    mediaRef(entry.contentMedia ?? entry.target,`sidebar.${entry.id}`);
  }
  for (const route of viewer.lightZones || []) {
    const interaction = manifest.interactions.find((entry) => entry.id === route.id && entry.type === 'location_light_profile');
    if (interaction && ['params','lights','exposure'].some((key) => JSON.stringify(interaction.behavior?.[key]) !== JSON.stringify(route[key]))) {
      warnings.push(`interactions.${route.id}: portable lighting differs from r3fCurrent; retain active viewer behavior pending archival reconciliation`);
    }
  }
  return { errors, warnings };
}
