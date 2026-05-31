export type UnknownRecord = Record<string, unknown>;

export interface ExhibitConfig extends UnknownRecord {
  id?: string;
  metadata?: UnknownRecord;
  modelPath?: string;
  interactivesPath?: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  backgroundTexture?: string;
  environmentTexture?: string;
  backgroundColor?: string;
  images?: Record<string, UnknownRecord>;
  videos?: UnknownRecord[];
  audio?: UnknownRecord[];
  objects?: Record<string, UnknownRecord>;
  objectRegistry?: Record<string, UnknownRecord>;
  sculptures?: Record<string, UnknownRecord>;
  sidebar?: UnknownRecord;
  params?: UnknownRecord;
  lights?: UnknownRecord;
  lightZones?: UnknownRecord[];
  audioZones?: UnknownRecord[];
  interactions?: UnknownRecord;
  links?: UnknownRecord;
  proceduralRoom?: UnknownRecord;
  models?: UnknownRecord[];
  thumbnailCapture?: UnknownRecord;
  physics?: UnknownRecord;
}
