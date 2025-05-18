import React, { useState, useRef, useEffect, FC } from 'react';

// Types for sidebar items and dependencies
export interface SidebarItem {
  id: string;
  label: string;
  icon?: string;
  img?: { src: string };
  link?: string;
  target: string;
  content: string;
}

export interface SidebarDeps {
  rendererMap?: { domElement: HTMLElement };
}

export interface SidebarProps {
  logoText: string;
  items: SidebarItem[];
  deps?: SidebarDeps;
}

const Sidebar: FC<SidebarProps> = ({ logoText, items, deps }) => {
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Handle map embedding when its panel opens
  useEffect(() => {
    if (openInfoId && openInfoId.includes('map') && deps?.rendererMap && mapContainerRef.current) {
      mapContainerRef.current.innerHTML = '';
      mapContainerRef.current.appendChild(deps.rendererMap.domElement);
    }
  }, [openInfoId, deps]);

  const toggleInfo = (targetId: string) => {
    setOpenInfoId(prev => (prev === targetId ? null : targetId));
  };

  return (
    <aside className="sidebar">
      <div className="logo-details">
        <div className="logo_name">{logoText}</div>
      </div>
      <ul className="nav-list">
        {items.map(item => (
          <li key={item.id} className="mb-2">
            {item.link ? (
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center px-2 py-1 rounded-lg hover:bg-blue-600">
                <img
                  src={item.img?.src || item.icon}
                  alt={item.label}
                  className="h-8 w-8 mr-3 rounded"
                />
                <span className="links_name text-blue-200 font-bold">{item.label}</span>
              </a>
            ) : (
              <>
                <button
                  id={item.id}
                  data-divid={item.target}
                  onClick={() => toggleInfo(item.target)}
                  className="flex items-center w-full px-2 py-1 rounded-lg bg-gray-800 hover:bg-blue-600"
                >
                  <img
                    src={item.img?.src || item.icon}
                    alt={item.label}
                    className="h-8 w-8 mr-3 rounded"
                  />
                  <span className="links_name text-blue-200 font-bold">{item.label}</span>
                </button>
                <div
                  className={`info_sidebar ${openInfoId === item.target ? 'open' : ''}`}
                  id={item.target}
                  ref={item.target.includes('map') ? mapContainerRef : null}
                >
                  {!item.target.includes('map') && (
                    <span className="info_text text-white">{item.content}</span>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default Sidebar;
