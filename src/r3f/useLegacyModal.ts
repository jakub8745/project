import { useEffect, useRef } from 'react';
import { setupModal } from '../modules/setupModal';

type ImageMeta = {
  title: string;
  description?: string;
  author?: string;
  img?: { src: string };
  imagePath?: string;
  oracleImagePath?: string;
};

export type LegacyImageMap = Record<string, ImageMeta>;

export function useLegacyModal(images: LegacyImageMap | undefined) {
  const showModalRef = useRef<ReturnType<typeof setupModal> | null>(null);

  useEffect(() => {
    if (!images) {
      showModalRef.current = null;
      return;
    }
    const showModal = setupModal(images);
    showModalRef.current = showModal;
    return () => {
      showModalRef.current = null;
    };
  }, [images]);

  return (userData: Record<string, unknown>) => {
    showModalRef.current?.({ ...userData });
  };
}

export default useLegacyModal;
