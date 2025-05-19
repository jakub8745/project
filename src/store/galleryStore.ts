// src/store/galleryStore.ts
import { create } from 'zustand';
import { GalleryItem } from '../data/galleryConfig';

const DEFAULT_CONFIG_URL =
  'https://bafybeiacxiiqnajlgll6naaulp6ervnfte6kbp75hkhsj4gzpzz7wxze7m.ipfs.w3s.link/exhibit_puno85_config.json';

function getConfigUrlFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('configUrl');
}

interface GalleryState {
  /** all the items in your grid */
  galleries: GalleryItem[];

  /** the full item the user has clicked (or null) */
  selectedGallery: GalleryItem | null;

  /** load up your array at startup */
  setGalleries: (galleries: GalleryItem[]) => void;

  /** call with the full item (or null to clear) */
  selectGallery: (item: GalleryItem | null) => void;

  /**
   * Returns, in order:
   * 1. configUrl of the clicked item
   * 2. ?configUrl=… in the URL
   * 3. DEFAULT_CONFIG_URL
   */
  getEffectiveConfigUrl: () => string;
}

export const useGalleryStore = create<GalleryState>((set, get) => ({
  galleries: [],
  selectedGallery: null,

  setGalleries: (galleries) => set({ galleries }),

  selectGallery: (item) => set({ selectedGallery: item }),

  getEffectiveConfigUrl: () => {
    const { selectedGallery } = get();

    if (selectedGallery) {
      return selectedGallery.configUrl;
    }
    const fromQuery = getConfigUrlFromQuery();
    if (fromQuery) {
      return fromQuery;
    }
    return DEFAULT_CONFIG_URL;
  },
}));
