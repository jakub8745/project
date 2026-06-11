import { useEffect, useState } from 'react';

export function useModalInteractionState() {
  const [isVideoPlayerModalOpen, setIsVideoPlayerModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onModalState = (event: Event) => {
      const custom = event as CustomEvent<{ open?: boolean }>;
      setIsVideoPlayerModalOpen(custom.detail?.open === true);
    };
    window.addEventListener('video-player-modal-state', onModalState as EventListener);
    return () => {
      window.removeEventListener('video-player-modal-state', onModalState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onModalState = (event: Event) => {
      const custom = event as CustomEvent<{ open?: boolean }>;
      setIsMaterialModalOpen(custom.detail?.open === true);
    };
    window.addEventListener('material-modal-state', onModalState as EventListener);
    return () => {
      window.removeEventListener('material-modal-state', onModalState as EventListener);
    };
  }, []);

  return {
    isVideoPlayerModalOpen,
    isMaterialModalOpen
  };
}
