import { FC, ReactNode } from 'react';

export interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  logoText: string;
  children: ReactNode;
  // remove configUrl completely
}

const Sidebar: FC<SidebarProps> = ({ open, onToggle, logoText, children }) => (
  <>
    <button
      onClick={onToggle}
      className={`
        fixed top-4 z-30 p-2 bg-blue-600 text-white rounded-r-lg shadow
        transition-all duration-300 ease-in-out
        ${open ? 'left-[90vw] md:left-[32rem]' : 'left-0'}
      `}
    >
      {open ? '<' : '>'}
    </button>

    <aside
      className={`
        fixed inset-y-0 left-0 transform bg-gray-900 text-white overflow-y-auto
        transition-transform duration-300 ease-in-out z-30
        ${open ? 'translate-x-0' : '-translate-x-full'}
        w-[90vw] md:w-[32rem]
      `}
    >
      <div className="logo-details p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold logo_name">{logoText}</h1>
      </div>

      <div className="nav-list p-4">
        {children} {/* ✅ Only ever shows what you pass in */}
      </div>
    </aside>
  </>
);

export default Sidebar;