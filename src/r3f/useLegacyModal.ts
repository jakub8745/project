import { useEffect, useRef } from 'react';
import { setupModal } from '../modules/setupModal';

export function useLegacyModal(imagesMap: Parameters<typeof setupModal>[0] | undefined) {
  const showModalRef = useRef<ReturnType<typeof setupModal> | null>(null);

  useEffect(() => {
    if (!imagesMap) {
      showModalRef.current = null;
      return;
    }
    const showModal = setupModal(imagesMap);
    showModalRef.current = showModal;
    return () => {
      // Legacy modal cleans itself up when the DOM is removed; nothing special needed here.
      showModalRef.current = null;
    };
  }, [imagesMap]);

  const showLegacyModal = (userData: Record<string, unknown>) => {
    showModalRef.current?.(userData);
  };

  return showLegacyModal;
}

export default useLegacyModal;
