import { oracleStaticUrl } from '../utils/ipfs';

export interface GalleryItem {
  slug: string;
  thumbnailVideo: string;
  thumbnailPoster?: string;
  title: string;
  description: string;
  configUrl: string;
  ogImage: string;
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
    title: 'Cracks of Meaning: Videopoetry in the age of AI',
    description: 'Critical work with AI in art education',
    configUrl: './configs/vectai_krakow_032026_config_v2.json',
    ogImage: '/textures/vectai/og_image_vectai.jpg',
  },
  {
    slug: 'videopoem_lisbon_112025',
    thumbnailVideo: '/sidebar_thumbnails/thumb_lisbon_videopoetry.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_lisbona_videopoetry.jpg',
    title: 'LIVING HERITAGE: REMEDIATING THROUGH VIDEOPOETRY',
    description: '3 videopoems created in the framework of workshops organised within the CAPHE project',
    configUrl: './configs/videopoem_lisbon_112025_config_v2.json',
    ogImage: '',
  },
  {
    slug: 'cipriani',
    thumbnailVideo: '/sidebar_thumbnails/thumb_cipriani.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_cipriani.jpg',
    title: 'Cipriani - Vincenz',
    description: 'Modern meets classic',
    configUrl: './configs/cipriani_config.json',
    ogImage: '',
  },
  {
    slug: 'bednarczyk',
    thumbnailVideo: '/sidebar_thumbnails/thumb_bednarczyk.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_bednarczyk.jpg',
    title: 'Unveiling the Heritage of Krystyna Bednarczyk',
    description: '3D Documentation of the project',
    configUrl: './configs/bednarczyk_config.json',
    ogImage: '',
  },
  {
    slug: 'dystopia',
    thumbnailVideo: '/sidebar_thumbnails/thumb_dystopia.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_dystopia.jpg',
    title: 'Dystopia of imitation',
    description: 'Modern meets classic',
    configUrl: './configs/dystopia_config.json',
    ogImage: '',
  },
  {
    slug: 'identity',
    thumbnailVideo: '/sidebar_thumbnails/thumb_identity.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_identity.jpg',
    title: 'Identity Preview',
    description: 'Exploring self and society',
    configUrl: './configs/identity_config.json',
    ogImage: '',
  },
  {
    slug: 'wakeupcall',
    thumbnailVideo: '/sidebar_thumbnails/thumb_wakeupcall.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_wakeupcall.jpg',
    title: 'WakeUp Call',
    description: 'Modern meets classic',
    configUrl: './configs/wakeup_config.json',
    ogImage: '',
  },
  {
    slug: 'lockdowns',
    thumbnailVideo: '/sidebar_thumbnails/thumb_lockdowns.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_lockdowns.jpg',
    title: 'Joanna Ciechanowska - Lockdowns',
    description: 'A look back at 2020',
    configUrl: './configs/lockdowns_config.json',
    ogImage: '',
  },
  {
    slug: 'videopoetry',
    thumbnailVideo: '/sidebar_thumbnails/thumb_15poets.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_15poets.jpg',
    title: 'layout for the Tom Konyves exhibition space',
    description: '',
    configUrl: './configs/tom_exhibit_config.json',
    ogImage: '',
  },
  {
    slug: 'prompt_procedural_room',
    thumbnailVideo: '/sidebar_thumbnails/thumb_agentsroom.mp4',
    thumbnailPoster: '/sidebar_thumbnails/poster_agentsroom.jpg',
    title: 'Collision Salon',
    description: 'Conversation is not a feature but a consequence',
    configUrl: './configs/prompt_procedural_room_config.json',
    ogImage: '',
  },
];
