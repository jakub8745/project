import { createContext } from 'react';
import type { ModalImageMap, ModalOpenPayload } from './Modal';

export type MaterialModalContextValue = {
  setImages: (images: ModalImageMap | undefined) => void;
  showModal: (payload: ModalOpenPayload) => void;
  hideModal: () => void;
};

export const MaterialModalContext = createContext<MaterialModalContextValue | null>(null);

export default MaterialModalContext;
