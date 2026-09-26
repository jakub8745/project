import type { ExhibitConfigV2, SceneManifest, SceneNodeDefinition, RuntimeModulesConfig, ViewerCompatConfig } from './exhibitSchemaV2';

export interface ExhibitAssetV3 {
  id: string;
  kind: string;
  sourceUri: string;
  ipfsUri: string | null;
  fallbackUris?: string[];
  mimeType: string;
  sha256?: string | null;
  byteSize?: number | null;
  preservation: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExhibitConfigV3 {
  schemaVersion: string;
  manifestType: 'future-proof-exhibit-archive';
  profile: 'portable-exhibit' | 'portable-exhibit-nft';
  id: string;
  slug?: string;
  sourceManifest?: { path: string; schemaVersion: string; sha256?: string; [key: string]: unknown };
  metadata: ExhibitConfigV2['metadata'];
  assets: Record<string, ExhibitAssetV3>;
  content: { media?: ExhibitConfigV2['media']; sidebar?: ExhibitConfigV2['sidebar'] };
  sceneGraph: {
    sourceScene: SceneManifest;
    nodes: Record<string, SceneNodeDefinition>;
    modules?: RuntimeModulesConfig;
    viewerProfiles?: { r3fCurrent?: ViewerCompatConfig };
    proceduralRecipe?: Record<string, unknown>;
    [key: string]: unknown;
  };
  interactions: unknown[];
  previews?: { capture?: { r3fCurrent?: ExhibitConfigV2['thumbnailCapture'] }; [key: string]: unknown };
  viewerBrief: { purpose: string; requiredCapabilities: string[]; reconstructionPrompt: string; [key: string]: unknown };
  preservation: { futureProofDefinition: string; requiredBeforeMinting: string[]; [key: string]: unknown };
  [key: string]: unknown;
}
