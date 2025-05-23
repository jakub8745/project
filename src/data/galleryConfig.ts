// src/data/galleryConfig.ts
export interface GalleryItem {
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

export const GALLERIES: GalleryItem[] = [{
    url: "https://bafybeiec35tpnq522bma536klp5cmqwnc55qmqepxquc2mmswwj63qbygq.ipfs.w3s.link/preview_puno85.glb",
    title: '85 lat PUNO',
    description: 'Wystawa z okazji 85-lecia PUNO',
    scale: 0.07,
    position: [0, 0, 0],
    configUrl: "./configs/puno85_config.json",

    "keywords": ["PUNO", "85-lecie", "Londyn", "3D art", "webgl"],
    "ogImage": "https://bluepointart.uk/preview.png",


    "overlayText":
        "Wystawa z okazji<br/>85-lecia<br/>Polskiego Uniwersytetu na Obczyźnie",

    "videos": [
        {
            "id": "animacja85",
            "loop": true,
            "muted": true,
            "playsinline": true,
            "sources": [
                {
                    "src": "ipfs://bafybeigmokyvn64skdaicma52xeet6n7yutqqhyzjq75nqihkwwlzjuyb4/PUNO85_compressed_480.mp4",
                    "type": "video/mp4"
                }
            ]
        }
        // ...you could list more videos here
    ]
},
{
    url: "https://bafybeiae35vsmewlokdlbgurbvya5kf2uy23f4woteokf4p3qrvwi3xfjm.ipfs.w3s.link/preview_cipriani05.glb",
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
    url: "https://bafybeibwkpikvcnrmme3tjwzvam7bzconw23fxnrk2c3b22s4lq2dtxfja.ipfs.w3s.link/preview_dystopia.glb",
    title: 'Dystopia of imitation',
    description: 'Modern meets classic',
    scale: 0.3,
    position: [0, 0, 0],
    configUrl: "https://bafybeiacxiiqnajlgll6naaulp6ervnfte6kbp75hkhsj4gzpzz7wxze7m.ipfs.w3s.link/exhibit_puno85_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},

{
    url: "https://bafybeihlip3dvgdu7m4zf66hhktrdd2bpxkkl2s6uge5ifmhsx7ympvmdq.ipfs.w3s.link/preview_identity.glb",
    title: 'Identity Preview',
    description: 'Exploring self and society',
    scale: 0.29,
    position: [0, 0, 0],
    configUrl: "https://bafybeiacxiiqnajlgll6naaulp6ervnfte6kbp75hkhsj4gzpzz7wxze7m.ipfs.w3s.link/exhibit_puno85_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},

{
    url: "https://bafybeib3shw4j4adxamxk2bchwnvz2t6nhoy6puosrz5iaxrp6uv2dotnq.ipfs.w3s.link/preview_wakeupcall.glb",
    title: 'WakeUp Call',
    description: 'Modern meets classic',
    scale: 0.065,
    position: [0, 0, 0],
    configUrl: "https://bafybeiacxiiqnajlgll6naaulp6ervnfte6kbp75hkhsj4gzpzz7wxze7m.ipfs.w3s.link/exhibit_puno85_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},
{
    url: "https://bafybeigqaweptpcmauzusqfs4ifzi6dsbo6r2ogckzzmsa2wkrzji7pyku.ipfs.w3s.link/preview_lockdowns.glb",
    title: 'Joanna Ciechanowska - Lockdowns',
    description: 'A look back at 2020',
    scale: 0.45,
    position: [0, 0, 0],
    configUrl: "https://bafybeiacxiiqnajlgll6naaulp6ervnfte6kbp75hkhsj4gzpzz7wxze7m.ipfs.w3s.link/exhibit_puno85_config.json",
    keywords: [],
    ogImage: "",
    overlayText: "",
    videos: []
},
    // …add as many as you like
];

