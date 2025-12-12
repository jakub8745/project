import { useContext } from 'react';
import { MaterialModalContext, type MaterialModalContextValue } from './materialModalContext';

export function useMaterialModal(): MaterialModalContextValue {
  const ctx = useContext(MaterialModalContext);
  if (!ctx) {
    throw new Error('useMaterialModal must be used within a MaterialModalProvider');
  }
  return ctx;
}

export default useMaterialModal;
