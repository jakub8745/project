import { oracleStaticUrl } from '../utils/ipfs';

export interface GalleryItem {
  slug: string;
  thumbnailVideo?: string;
  thumbnailPoster?: string;
  configUrl: string;
}

export const COMMON_ICONS = {
  info: oracleStaticUrl('info.png'),
  logoBpa: oracleStaticUrl('logo_BPA_256px.gif'),
};

export const GALLERIES: GalleryItem[] = [
  {
    slug: 'milkmaid_pitchers',
    thumbnailVideo: '/sidebar_thumbnails/thumb_milkmaid.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_milkmaid.jpg',
    configUrl: '/configs/milkmaid_pitchers_config_v3.json',
  },
  {
    slug: 'vectai_krakow_032026',
    thumbnailVideo: '/sidebar_thumbnails/thumb_vectai_cracks.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_vectai_cracks.jpg',
    configUrl: '/configs/vectai_krakow_032026_config_v3.json',
  },
  {
    slug: 'videopoem_lisbon_112025',
    thumbnailVideo: '/sidebar_thumbnails/thumb_lisbon_videopoetry.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_lisbona_videopoetry.jpg',
    configUrl: '/configs/videopoem_lisbon_112025_config_v3.json',
  },
  {
    slug: 'cipriani',
    thumbnailVideo: '/sidebar_thumbnails/thumb_cipriani.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_cipriani.jpg',
    configUrl: '/configs/cipriani_config_v3.json',
  },
  {
    slug: 'bednarczyk',
    thumbnailVideo: '/sidebar_thumbnails/thumb_bednarczyk.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_bednarczyk.jpg',
    configUrl: '/configs/bednarczyk_config_v3.json',
  },
  {
    slug: 'dystopia',
    thumbnailVideo: '/sidebar_thumbnails/thumb_dystopia.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_dystopia.jpg',
    configUrl: '/configs/dystopia_config_v3.json',
  },
  {
    slug: 'identity',
    thumbnailVideo: '/sidebar_thumbnails/thumb_identity.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_identity.jpg',
    configUrl: '/configs/identity_config_v3.json',
  },
  {
    slug: 'wakeupcall',
    thumbnailVideo: '/sidebar_thumbnails/thumb_wakeupcall.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_wakeupcall.jpg',
    configUrl: '/configs/wakeup_config_v3.json',
  },
  {
    slug: 'lockdowns',
    thumbnailVideo: '/sidebar_thumbnails/thumb_lockdowns.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_lockdowns.jpg',
    configUrl: '/configs/lockdowns_config_v3.json',
  },
  {
    slug: 'videopoetry',
    thumbnailVideo: '/sidebar_thumbnails/thumb_15poets.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_15poets.jpg',
    configUrl: '/configs/tom_exhibit_config_v3.json',
  },
  {
    slug: 'prompt_procedural_room',
    thumbnailVideo: '/sidebar_thumbnails/thumb_agentsroom.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_agentsroom.jpg',
    configUrl: '/configs/prompt_procedural_room_config_v3.json',
  },
];
