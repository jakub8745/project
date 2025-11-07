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
        title?: string;
        description?: string;
        author?: string;
        sources: {
            src: string;
            type: string;
        }[];
    }[];
}

export const DEFAULT_CONFIG_URL = "./configs/puno85_config.json";
import { oracleStaticUrl } from '../utils/ipfs';

// Common reusable sidebar item: Help / How to move
export const COMMON_HELP_ITEM = {
    id: "help-icon",
    label: "How to move in the gallery",
    icon: oracleStaticUrl('how_to_move.png'),
    content:
        "<strong>SPOSÓB PORUSZANIA SIĘ PO GALERII:</strong><br /><br /><img alt=\"Move: W, A, S, D or Arrow Keys\" style=\"display: block; margin: 0 auto 1em auto; max-width: 60%; height: auto; filter: invert(37%) sepia(47%) saturate(72%) hue-rotate(167deg);\" src=\"https://bafybeibyn5zrmeallmsfj7noetbpy4l7pxnpza7mbcaj7xsqzz6rqidehu.ipfs.w3s.link/WASD.png\" /><br /><div style=\"display: flex; justify-content: center; gap: 1em; margin-bottom: 1em;\"><img alt=\"Rotate View: Click + Swipe\" style=\"height: 8em; translate: -2em; filter: invert(37%) sepia(47%) saturate(72%) hue-rotate(167deg)\" src=\"https://bafybeiemorbsojoayepbybcskwhg3n2a6qpexcsd3ip3zsekxde464lx2q.ipfs.w3s.link/swipe.png\" /><img alt=\"View Details: Click + Hold (1s)\" style=\"height: 6em; translate: 1em 2em; filter: invert(37%) sepia(47%) saturate(72%) hue-rotate(167deg)\" src=\"https://bafybeihn6k4kn5cpiipvtzq3o7n7f6g7fa3wv2krnbam3gwxm7rlc7w4xu.ipfs.w3s.link/hold.png\" /></div><br /><br /><br />Ruch: W, A, S, D lub strzałki<br />Obrót: Kliknij i przeciągnij<br />Wyświetlenie szczegółów: Kliknij i przytrzymaj (1 sekunda)<br /><br /><strong>Ekran dotykowy:</strong><br />Ruch: Dotknij i przytrzymaj (1 sekunda)<br />Obrót widoku: Przeciągnij palcem<br />Wyświetlenie szczegółów: Dotknij i przytrzymaj (1 sekunda)<br />Zamknij i otwórz sidebar: <img alt=\"Przełącznik Sidebara\" style=\"top: 0.7em; position: relative;\" src=\"https://bafybeig7gxuqnop6dvrlvz2cto2hil4lanxkde5hue7frvmtofvd5hpd44.ipfs.w3s.link/CloseSidebar.png\" /><br /><br /><strong>HOW TO MOVE IN THE GALLERY:</strong><br /><br />Move: W, A, S, D or Arrow Keys<br />Rotate View: Click + Swipe<br />View Details: Click + Hold (1s)<br /><br /><strong>Touchscreen:</strong><br />Move: Tap + Hold (2s)<br />Rotate View: Drag Finger<br />View Details: Tap + Hold (1s)<br />Close and Open This Sidebar: <img alt=\"Toggle Sidebar\" style=\"top: 0.7em; position: relative;\" src=\"https://bafybeig7gxuqnop6dvrlvz2cto2hil4lanxkde5hue7frvmtofvd5hpd44.ipfs.w3s.link/CloseSidebar.png\" /><br /><br />"
};

export const COMMON_ICONS = {
    info: oracleStaticUrl('info.png'),
    logoBpa: oracleStaticUrl('logo_BPA_256px.gif'),
};

export const GALLERIES: GalleryItem[] = [
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
        scale: 0.1,
        position: [0, 0, 0],
        configUrl: "./configs/bednarczyk_config.json",
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
    {
        slug: "videopoetry",
        url: "/sidebar_models/preview_wystawaTom.glb",
        title: 'layout for the Tom Konyves exhibition space',
        description: '',
        scale: 0.15,
        position: [0, 0, 0],
        configUrl: "./configs/tom_exhibit_config.json",
        keywords: [],
        ogImage: "",
        overlayText: "",
        videos: []
    },








    // …add as many as you like

];
/*//
    {
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
*/