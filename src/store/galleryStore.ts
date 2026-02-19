// src/store/galleryStore.ts
import { create } from 'zustand';
import { DEFAULT_CONFIG_URL, GALLERIES, GalleryItem } from '../data/galleryConfig';

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
   * 3. first gallery configUrl
   * 4. DEFAULT_CONFIG_URL
   */
  getEffectiveConfigUrl: () => string;
}

export const useGalleryStore = create<GalleryState>((set, get) => ({
  galleries: GALLERIES,
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
    const firstGalleryConfig = get().galleries[0]?.configUrl ?? GALLERIES[0]?.configUrl;
    return firstGalleryConfig ?? DEFAULT_CONFIG_URL;
  },
}));
