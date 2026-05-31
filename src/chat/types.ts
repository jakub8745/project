export interface SceneChatCollisionEvent {
  a: string;
  b: string;
  point: [number, number, number];
  penetration: number;
  timestamp: number;
}

export interface SceneAgent {
  id: string;
  label: string;
  systemPrompt: string;
  systemPromptPath?: string;
  collisionPrompt: string;
  chatOnCollision: boolean;
}

export interface SceneChatConfig {
  enabled: boolean;
  title: string;
  visitorActorId: string;
  collisionCooldownMs: number;
  blobs: SceneAgent[];
}

export type BlobPersona = SceneAgent;
export type BlobChatSettings = SceneChatConfig;
export type PhysicsCollisionEvent = SceneChatCollisionEvent;

export const DEFAULT_SCENE_CHAT_CONFIG: SceneChatConfig = {
  enabled: false,
  title: 'Blob Chat',
  visitorActorId: 'visitor',
  collisionCooldownMs: 4500,
  blobs: [
    {
      id: 'blob_alpha',
      label: 'Blob Alpha',
      systemPrompt:
        'You are Blob Alpha, an art-focused guide in a virtual gallery. Discuss only art, artworks, curation, media, aesthetics, interpretation, and art history.',
      collisionPrompt:
        'A collision happened between Blob Alpha and the visitor in the room. Reply with one short, art-focused message.',
      chatOnCollision: true
    }
  ]
};

export const DEFAULT_BLOB_CHAT_SETTINGS = DEFAULT_SCENE_CHAT_CONFIG;
