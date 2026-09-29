import type { ExhibitMetadata, MediaDescriptor, SceneManifest, SceneNodeDefinition, RuntimeModulesConfig, ViewerCompatConfig, SidebarDefinition, ThumbnailCaptureDefinition } from './exhibitSceneTypes';

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
  metadata: ExhibitMetadata;
  assets: Record<string, ExhibitAssetV3>;
  content: { media?: Record<string, MediaDescriptor>; sidebar?: SidebarDefinition };
  sceneGraph: {
    sourceScene: SceneManifest;
    nodes: Record<string, SceneNodeDefinition>;
    modules?: RuntimeModulesConfig;
    viewerProfiles?: { r3fCurrent?: ViewerCompatConfig };
    proceduralRecipe?: Record<string, unknown>;
    [key: string]: unknown;
  };
  interactions: unknown[];
  previews?: { capture?: { r3fCurrent?: ThumbnailCaptureDefinition }; [key: string]: unknown };
  viewerBrief: { purpose: string; requiredCapabilities: string[]; reconstructionPrompt: string; [key: string]: unknown };
  preservation: { futureProofDefinition: string; requiredBeforeMinting: string[]; [key: string]: unknown };
  [key: string]: unknown;
}
