import { useCallback, useEffect } from 'react';
import { type ModalImageMap, type ModalOpenPayload } from './Modal';
import { useMaterialModal } from './useMaterialModal';

export type LegacyImageMap = ModalImageMap;

export function useLegacyModal(images: LegacyImageMap | undefined) {
  const { setImages, showModal } = useMaterialModal();

  useEffect(() => {
    setImages(images);
  }, [images, setImages]);

  return useCallback((userData: Record<string, unknown>) => {
    const payload: ModalOpenPayload = { ...userData };
    showModal(payload);
  }, [showModal]);
}

export default useLegacyModal;
