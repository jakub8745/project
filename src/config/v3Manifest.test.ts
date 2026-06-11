import { describe, expect, it } from 'vitest';
import vectaiV2 from '../../public/configs/vectai_krakow_032026_config_v2.json';
import vectaiV3 from '../../public/configs/vectai_krakow_032026_config_v3.json';
import uploadManifest from '../../public/configs/vectai_krakow_032026_ipfs_upload_manifest.json';

describe('VECT-AI v3 future-proof manifest', () => {
  it('contains the required portable archive sections', () => {
    expect(vectaiV3.schemaVersion).toMatch(/^3\./);
    expect(vectaiV3.manifestType).toBe('future-proof-exhibit-archive');
    expect(vectaiV3.profile).toBe('portable-exhibit-nft');
    expect(vectaiV3.metadata.archiveDescription).toContain('portable archival 3D exhibit');
    expect(vectaiV3.viewerBrief.requiredCapabilities).toContain('load glTF/GLB scene asset');
    expect(vectaiV3.viewerBrief.reconstructionPrompt).toContain('choose the most suitable contemporary 3D framework');
    expect(vectaiV3.nft.tokenMetadataTemplate.properties.manifest).toBe('ipfs://CID_FOR_vectai_krakow_032026_config_v3_json');
  });

  it('preserves every v2 asset and adds the v3 manifest as a minting asset', () => {
    const v2AssetIds = Object.keys(vectaiV2.assets);
    const v3AssetIds = Object.keys(vectaiV3.assets);
    expect(v3AssetIds).toEqual(expect.arrayContaining(v2AssetIds));
    expect(v3AssetIds).toContain('manifest_v3_json');
    expect(vectaiV3.assets.scene_model.role).toBe('canonical_scene');
    expect(vectaiV3.assets.og_image.role).toBe('canonical_preview');
  });

  it('lists every v3 asset in the IPFS upload manifest', () => {
    const uploadIds = uploadManifest.assets.map((asset) => asset.id);
    expect(uploadIds).toEqual(expect.arrayContaining(Object.keys(vectaiV3.assets)));
  });
});
