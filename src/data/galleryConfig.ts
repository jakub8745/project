// src/data/galleryConfig.ts
export interface GalleryItem {
    slug: string;
    url: string;
    title: string;
    description: string;
    /** Uniform scale factor to apply instead of auto‐computed. */
    scale?: number;
    /** [x,y,z] position offset instead of auto‐center. */
    position?: [number, number, number];
    configUrl: string;
    keywords: string[];
    ogImage: string;
    overlayText: string;
    videos: {
        id: string;
        loop: boolean;
        muted: boolean;
        playsinline: boolean;
        sources: {
            src: string;
            type: string;
        }[];
    }[];
}

export const DEFAULT_CONFIG_URL = "./configs/puno85_config.json";

export const GALLERIES: GalleryItem[] = [{
    slug: "puno85",
    url: "/sidebar_models/preview_puno85.glb",
    title: '85 lat PUNO',
    description: 'Wystawa z okazji 85-lecia PUNO',
    scale: 0.07,
    position: [0, 0, 0],
    configUrl: "./configs/puno85_config.json",
    "keywords": ["PUNO", "85-lecie", "Londyn", "3D art", "webgl"],
    "ogImage": "https://bluepointart.uk/preview.png",
    "overlayText":
        "Wystawa z okazji<br/>85-lecia<br/>Polskiego Uniwersytetu na Obczyźnie",
    "videos": [],
},
{
    slug: "cipriani", 
    url: "/sidebar_models/preview_cipriani05.glb",
    title: 'Cipriani - Vincenz',
    description: 'Modern meets classic',
    scale: 0.35,
    position: [0, 0, 0],
    configUrl: "./configs/cipriani_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},
{
    slug: "bednarczyk", 
    url: "/sidebar_models/preview_bednarczyk.glb",
    title: 'Unvelling the Heritage of Krystyna Bednarczyk',
    description: '3D Documentation of the project',
    scale: 0.45,
    position: [0, 0, 0],
    configUrl: "./configs/lockdowns_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "ggggggg",
    videos: []
},
{
    slug: "dystopia",
    url: "/sidebar_models/preview_dystopia.glb",
    title: 'Dystopia of imitation',
    description: 'Modern meets classic',
    scale: 0.3,
    position: [0, 0, 0],
    configUrl: "./configs/dystopia_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},
{
    slug: "identity",
    url: "/sidebar_models/preview_identity.glb",
    title: 'Identity Preview',
    description: 'Exploring self and society',
    scale: 0.29,
    position: [0, 0, 0],
    configUrl: "./configs/identity_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},
{
    slug: "wakeupcall",
    url: "/sidebar_models/preview_wakeupcall.glb",
    title: 'WakeUp Call',
    description: 'Modern meets classic',
    scale: 0.065,
    position: [0, 0, 0],
    configUrl: "./configs/wakeup_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},
{
    slug: "lockdowns", 
    url: "/sidebar_models/preview_lockdowns.glb",
    title: 'Joanna Ciechanowska - Lockdowns',
    description: 'A look back at 2020',
    scale: 0.45,
    position: [0, 0, 0],
    configUrl: "./configs/lockdowns_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},








    // …add as many as you like

];

