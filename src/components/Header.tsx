import { FC, HTMLAttributes } from 'react';
import { Cuboid as Cube3d } from 'lucide-react';
import { useGalleryStore } from '../store/galleryStore';

export interface HeaderProps extends HTMLAttributes<HTMLElement> {
  /** Optional additional classes for the header container */
  className?: string;
}

const Header: FC<HeaderProps> = ({ className = '', ...rest }) => {
  const { selectedGallery, selectGallery } = useGalleryStore();

  return (
    <header
      className={`bg-gallery-dark border-b border-gray-800 sticky top-0 z-10 ${className}`}
      {...rest}
    >
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Cube3d className="text-gallery-accent h-8 w-8" />
          <h1 className="text-2xl font-semibold text-white">3D Gallery Explorer</h1>
        </div>

        {selectedGallery && (
          <button
            onClick={() => selectGallery(null)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-white transition-colors"
          >
            Back to Grid
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
