import { create } from 'zustand';

export interface GalleryConfig {
  id: string;
  name: string;
  description: string;
  modelPath: string;
  lighting: {
    ambient: number;
    directional: number;
  };
  camera: {
    position: [number, number, number];
    lookAt: [number, number, number];
  };
}

interface GalleryState {
  galleries: GalleryConfig[];
  selectedGallery: GalleryConfig | null;
  isLoading: boolean;
  error: string | null;
  setGalleries: (galleries: GalleryConfig[]) => void;
  selectGallery: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useGalleryStore = create<GalleryState>((set, get) => ({
  galleries: [],
  selectedGallery: null,
  isLoading: false,
  error: null,
  
  setGalleries: (galleries) => set({ galleries }),
  
  selectGallery: (id) => {
    if (id === null) {
      set({ selectedGallery: null });
      return;
    }
    
    const gallery = get().galleries.find(g => g.id === id) || null;
    set({ selectedGallery: gallery });
  },
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),
}));

const MODEL_PATHS = {
  gallery_1: "https://bafybeihccug4oawzfi2nvj6aacskjdmcpx624s7caceze7mrnxo6obdgxy.ipfs.w3s.link/puno85_preview.glb",
  gallery_2: "https://bafybeia2c7ctepv4bf24nj4tp5w4ne4a6rcybwesez3p3zchkftng263gq.ipfs.w3s.link/lockdowns_previev.glb",
  gallery_3: "https://bafybeiekq4p3pxmuk456o222hzk2zm4fjnpvfdbaxkoaogbduf2mlo32eq.ipfs.w3s.link/identity_preview.glb",
  gallery_4: "https://bafybeidf6aawjxraelz5limo5pmjgv534bh65a2njldrdtd6zokix3o2f4.ipfs.w3s.link/cipriani_preview.glb"
};

export const fetchGalleryConfig = async () => {
  const { setGalleries, setLoading, setError } = useGalleryStore.getState();
  
  try {
    setLoading(true);
    
    const galleries: GalleryConfig[] = Object.entries(MODEL_PATHS).map(([id, path], index) => ({
      id,
      name: `Exhibition ${index + 1}`,
      description: `A stunning 3D exhibition space showcasing unique digital artwork.`,
      modelPath: path,
      lighting: {
        ambient: 0.5,
        directional: 0.8,
      },
      camera: {
        position: [0, 1.5, 5],
        lookAt: [0, 0, 0],
      },
    }));
    
    setGalleries(galleries);
  } catch (err) {
    console.error('Failed to fetch gallery config:', err);
    setError('Failed to load gallery configurations. Please try again later.');
  } finally {
    setLoading(false);
  }
};