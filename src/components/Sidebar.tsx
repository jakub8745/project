import { FC, ReactNode } from 'react';
import { InfoButtons } from './InfoButtons';


export interface SidebarProps {
  /** Whether the sidebar is open */
  open: boolean;
  /** Function to toggle the sidebar open/closed */
  onToggle: () => void;
  /** Logo text to display at the top */
  logoText: string;
  /** Additional elements such as the gallery grid go here */
  children: ReactNode;
  configUrl: string;
}


/**
 * Responsive Sidebar:
 * - On small screens: width = 90vw (single column)
 * - On medium+ screens: width = 32rem (two-column layout inside sidebar)
 */
const Sidebar: FC<SidebarProps> = ({ open, onToggle, logoText, configUrl, children }) => (
  <>
    {/* Toggle button always visible, sticks to sidebar edge */}
    <button
      onClick={onToggle}
      className={`
        fixed top-4 z-30 p-2 bg-blue-600 text-white rounded-r-lg shadow focus:outline-none
        transition-all duration-300 ease-in-out
        ${open ? 'left-[90vw] md:left-[32rem]' : 'left-0'}
      `}
      aria-label={open ? 'Close sidebar' : 'Open sidebar'}
    >
      {open ? '<' : '>'}
    </button>

    <aside
      className={`
        fixed inset-y-0 left-0 transform bg-gray-900 text-white overflow-y-auto
        transition-transform duration-300 ease-in-out z-20
        ${open ? 'translate-x-0' : '-translate-x-full'}
        w-[90vw] md:w-[32rem]
      `}
    >
      {/* Logo / header section */}
      <div className="logo-details p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold logo_name">{logoText}</h1>
      </div>

      {/* Container for additional content (supports two columns on medium+) */}
      <div className="nav-list p-4">
        {configUrl && <InfoButtons configUrl={configUrl} />}
        {children}
      </div>

    </aside>
  </>
);

export default Sidebar;
