import { oracleStaticUrl } from '../utils/ipfs';

export interface GalleryItem {
  slug: string;
  thumbnailVideo: string;
  thumbnailPoster?: string;
  configUrl: string;
  configUrls: Record<'2' | '3', string>;
  defaultConfigVersion: '2' | '3';
}

export const COMMON_ICONS = {
  info: oracleStaticUrl('info.png'),
  logoBpa: oracleStaticUrl('logo_BPA_256px.gif'),
};

export const GALLERIES: GalleryItem[] = [
  {
    slug: 'vectai_krakow_032026',
    thumbnailVideo: '/sidebar_thumbnails/thumb_vectai_cracks.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_vectai_cracks.jpg',
    configUrl: '/configs/vectai_krakow_032026_config_v3.json',
    configUrls: { '2': '/configs/vectai_krakow_032026_config_v2.json', '3': '/configs/vectai_krakow_032026_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'videopoem_lisbon_112025',
    thumbnailVideo: '/sidebar_thumbnails/thumb_lisbon_videopoetry.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_lisbona_videopoetry.jpg',
    configUrl: '/configs/videopoem_lisbon_112025_config_v3.json',
    configUrls: { '2': '/configs/videopoem_lisbon_112025_config_v2.json', '3': '/configs/videopoem_lisbon_112025_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'cipriani',
    thumbnailVideo: '/sidebar_thumbnails/thumb_cipriani.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_cipriani.jpg',
    configUrl: '/configs/cipriani_config_v3.json',
    configUrls: { '2': '/configs/cipriani_config.json', '3': '/configs/cipriani_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'bednarczyk',
    thumbnailVideo: '/sidebar_thumbnails/thumb_bednarczyk.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_bednarczyk.jpg',
    configUrl: '/configs/bednarczyk_config_v3.json',
    configUrls: { '2': '/configs/bednarczyk_config.json', '3': '/configs/bednarczyk_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'dystopia',
    thumbnailVideo: '/sidebar_thumbnails/thumb_dystopia.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_dystopia.jpg',
    configUrl: '/configs/dystopia_config_v3.json',
    configUrls: { '2': '/configs/dystopia_config.json', '3': '/configs/dystopia_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'identity',
    thumbnailVideo: '/sidebar_thumbnails/thumb_identity.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_identity.jpg',
    configUrl: '/configs/identity_config_v3.json',
    configUrls: { '2': '/configs/identity_config.json', '3': '/configs/identity_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'wakeupcall',
    thumbnailVideo: '/sidebar_thumbnails/thumb_wakeupcall.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_wakeupcall.jpg',
    configUrl: '/configs/wakeup_config_v3.json',
    configUrls: { '2': '/configs/wakeup_config.json', '3': '/configs/wakeup_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'lockdowns',
    thumbnailVideo: '/sidebar_thumbnails/thumb_lockdowns.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_lockdowns.jpg',
    configUrl: '/configs/lockdowns_config_v3.json',
    configUrls: { '2': '/configs/lockdowns_config.json', '3': '/configs/lockdowns_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'videopoetry',
    thumbnailVideo: '/sidebar_thumbnails/thumb_15poets.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_15poets.jpg',
    configUrl: '/configs/tom_exhibit_config_v3.json',
    configUrls: { '2': '/configs/tom_exhibit_config.json', '3': '/configs/tom_exhibit_config_v3.json' },
    defaultConfigVersion: '3',
  },
  {
    slug: 'prompt_procedural_room',
    thumbnailVideo: '/sidebar_thumbnails/thumb_agentsroom.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_agentsroom.jpg',
    configUrl: '/configs/prompt_procedural_room_config_v3.json',
    configUrls: { '2': '/configs/prompt_procedural_room_config.json', '3': '/configs/prompt_procedural_room_config_v3.json' },
    defaultConfigVersion: '3',
  },
];

/** Select only registered manifests; query overrides remain stable across gallery switches. */
export function resolveGalleryConfigUrl(gallery: GalleryItem, search = ''): string {
  const requested = new URLSearchParams(search).get('configVersion');
  const version = requested === '2' || requested === '3' ? requested : gallery.defaultConfigVersion;
  return gallery.configUrls[version];
}
