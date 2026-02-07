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
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
      aria-controls="app-sidebar"
      aria-expanded={open}
      className={`
        fixed top-24 z-30 px-1.5 py-2 md:px-2 md:py-3 bg-white/90 text-slate-700 rounded-r-lg shadow-lg
        border border-slate-200 backdrop-blur transition-all duration-300 ease-in-out
        text-xs md:text-sm
        origin-left
        ${open ? 'rotate-90' : '-rotate-90'}
        ${open ? 'left-[calc(90vw+1.25rem)] md:left-[calc(32rem+1.25rem)]' : 'left-5'}
      `}
    >
      <span className="inline-block whitespace-nowrap leading-none" aria-hidden="true">
        {open ? 'Hide sidebar' : 'Open sidebar'}
      </span>
    </button>

    <aside
      id="app-sidebar"
      className={`
        fixed inset-y-0 left-0 transform bg-slate-500/35 text-white overflow-y-auto
        transition-transform duration-300 ease-in-out z-30
        ${open ? 'translate-x-0' : '-translate-x-full'}
        w-[90vw] md:w-[32rem] border-r border-slate-200 backdrop-blur
      `}
      style={{ fontFamily: '"Encode Sans Condensed", sans-serif' }}
    >
      <div className="logo-details p-4 border-b border-slate-200 bg-white/80">
        <h1 className="text-lg md:text-2xl font-bold logo_name text-slate-800">{logoText}</h1>
      </div>

      <div className="nav-list text-white h-full">
        {children} {/* ✅ Only ever shows what you pass in */}
      </div>
    </aside>
  </>
);

export default Sidebar;
