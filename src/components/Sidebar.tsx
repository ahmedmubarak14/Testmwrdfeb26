import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserRole } from '../types/types';
import { LanguageToggle } from './LanguageToggle';
import { useStore } from '../store/useStore';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  role: UserRole;
  activeTab: string;
  onNavigate: (tab: string) => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  userName?: string;
  userEmail?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  role,
  activeTab,
  onNavigate,
  onLogout,
  isOpen = false,
  onClose = () => { },
  userName,
  userEmail
}) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const profilePicture = useStore(state => state.currentUser?.profilePicture);

  const getSections = (): NavSection[] => {
    switch (role) {
      case UserRole.CLIENT:
        return [
          {
            title: t('sidebar.sections.main'),
            items: [
              { id: 'dashboard', label: t('sidebar.dashboard'), icon: 'home' },
              { id: 'browse', label: t('sidebar.browse'), icon: 'search' },
              { id: 'custom-request', label: t('sidebar.customRequest') || 'Custom Request', icon: 'design_services' },
              { id: 'rfqs', label: t('sidebar.rfqs'), icon: 'request_quote' },
              { id: 'orders', label: t('sidebar.orders'), icon: 'receipt_long' },
              { id: 'financials', label: t('sidebar.financials') || 'Financials', icon: 'account_balance_wallet' },
            ]
          },
          {
            title: t('sidebar.sections.account'),
            items: [
              { id: 'settings', label: t('sidebar.settings'), icon: 'settings' },
              { id: 'help', label: t('sidebar.help'), icon: 'help' },
            ]
          }
        ];
      case UserRole.SUPPLIER:
        return [
          {
            title: t('sidebar.sections.main'),
            items: [
              { id: 'dashboard', label: t('sidebar.dashboard'), icon: 'home' },
              { id: 'products', label: t('sidebar.products'), icon: 'inventory_2' },
              { id: 'requests', label: t('sidebar.requests'), icon: 'inbox' },
              { id: 'quotes', label: t('sidebar.quotes'), icon: 'send' },
              { id: 'orders', label: t('sidebar.ordersManagement'), icon: 'receipt_long' },
              { id: 'financials', label: t('sidebar.financials') || 'Financials', icon: 'payments' },
            ]
          },
          {
            title: t('sidebar.sections.account'),
            items: [
              { id: 'settings', label: t('sidebar.settings'), icon: 'settings' },
              { id: 'help', label: t('sidebar.help'), icon: 'help' },
            ]
          }
        ];
      case UserRole.ADMIN:
        return [
          {
            title: t('sidebar.sections.management'),
            items: [
              { id: 'overview', label: t('sidebar.overview'), icon: 'analytics' },
              { id: 'leads', label: t('sidebar.leads') || 'Leads', icon: 'person_add' },
              { id: 'custom-requests', label: t('sidebar.customRequests') || 'Custom Requests', icon: 'design_services' },
              { id: 'orders', label: t('sidebar.orders'), icon: 'receipt_long' },
              { id: 'po-verification', label: t('sidebar.poVerification') || 'PO Verification', icon: 'fact_check' },
              { id: 'inventory', label: t('sidebar.inventory') || 'Inventory', icon: 'inventory_2' },
              { id: 'master-catalog', label: t('sidebar.masterCatalog') || 'Master Catalog', icon: 'library_books' },
              { id: 'approvals', label: t('sidebar.approvalsLink'), icon: 'verified_user' },
              { id: 'margins', label: t('sidebar.margins'), icon: 'currency_exchange' },
              { id: 'logistics', label: t('sidebar.logistics'), icon: 'local_shipping' },
              { id: 'users', label: t('sidebar.users'), icon: 'group' },
            ]
          },
          {
            title: t('sidebar.sections.account'),
            items: [
              { id: 'settings', label: t('sidebar.settings'), icon: 'settings' },
            ]
          }
        ];
      default:
        return [];
    }
  };

  const getRoleName = () => {
    switch (role) {
      case UserRole.CLIENT: return t('sidebar.clientPortal');
      case UserRole.SUPPLIER: return t('sidebar.supplierPortal');
      case UserRole.ADMIN: return t('sidebar.adminPortal');
      default: return 'Portal';
    }
  };

  const getDisplayName = () => {
    if (userName) return userName;
    switch (role) {
      case UserRole.CLIENT: return t('sidebar.defaultClientName');
      case UserRole.SUPPLIER: return t('sidebar.defaultSupplierName');
      case UserRole.ADMIN: return t('sidebar.defaultAdminName');
      default: return t('sidebar.defaultUserName');
    }
  };

  const getDisplayEmail = () => {
    if (userEmail) return userEmail;
    switch (role) {
      case UserRole.CLIENT: return 'client+demo@example.com';
      case UserRole.SUPPLIER: return 'supplier+demo@example.com';
      case UserRole.ADMIN: return 'admin+demo@example.com';
      default: return 'user@mwrd.com';
    }
  };

  const handleNavClick = (tab: string) => {
    onNavigate(tab);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onClose();
    }
  };

  const sections = getSections();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed md:sticky top-0 left-0 rtl:left-auto rtl:right-0 h-screen flex flex-col border-r border-gray-100 bg-white z-50 rtl:border-r-0 rtl:border-l
        transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-20' : 'w-72'}
        ${isOpen ? 'translate-x-0 rtl:-translate-x-0' : '-translate-x-full rtl:translate-x-full md:translate-x-0 rtl:md:-translate-x-0'}
      `}>
        {/* Header */}
        <div className={`flex items-center h-16 border-b border-gray-100 ${isCollapsed ? 'px-4 justify-center' : 'px-5 justify-between'}`}>
          {/* Logo and brand */}
          <div className={`flex items-center gap-3 ${isCollapsed ? '' : ''}`}>
            <div className="w-10 h-10 bg-[#0A2540] rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="4" width="40" height="40" rx="4" fill="none" />
                <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="white" />
              </svg>
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <h1 className="text-gray-900 text-base font-semibold leading-tight">{t('brand.name')}</h1>
                <p className="text-gray-500 text-xs font-normal leading-tight">{getRoleName()}</p>
              </div>
            )}
          </div>

          {/* Hamburger toggle - desktop */}
          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="hidden md:flex items-center justify-center size-9 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              title={t('sidebar.collapse')}
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {/* Expand button when collapsed */}
          {isCollapsed && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="hidden md:flex absolute -right-3 rtl:-left-3 rtl:right-auto top-5 items-center justify-center size-6 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 shadow-sm transition-all"
              title={t('sidebar.expand')}
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          )}

          {/* Close button - mobile only */}
          {!isCollapsed && (
            <button
              onClick={onClose}
              className="md:hidden flex items-center justify-center size-9 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          )}
        </div>

        {/* Search bar - only when expanded */}
        {!isCollapsed && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
              <span className="material-symbols-outlined text-gray-400 text-lg">search</span>
              <input
                type="text"
                placeholder={t('sidebar.search')}
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
              />
            </div>
          </div>
        )}

        {/* Navigation sections */}
        <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-3 py-4' : 'px-4 py-2'}`}>
          {sections.map((section, sectionIndex) => (
            <div key={section.title} className={sectionIndex > 0 ? 'mt-8' : ''}>
              {/* Section header */}
              {!isCollapsed && (
                <div className="flex items-center gap-3 mb-3 px-2">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    {section.title}
                  </p>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}

              {/* Section divider when collapsed */}
              {isCollapsed && sectionIndex > 0 && (
                <div className="mb-4 mx-1 border-t border-gray-100" />
              )}

              {/* Section items */}
              <div className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    data-testid={`sidebar-nav-${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    className={`
                      group flex items-center gap-3 rounded-xl transition-all duration-200 w-full
                      ${isCollapsed ? 'justify-center p-3' : 'px-4 py-3 text-left rtl:text-right'}
                      min-h-[48px]
                      ${activeTab === item.id
                        ? 'bg-[#137fec]/8 text-[#137fec] shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }
                    `}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span
                      className={`material-symbols-outlined text-[22px] flex-shrink-0 transition-transform group-hover:scale-105 ${activeTab === item.id ? '' : ''}`}
                      style={activeTab === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}
                    >
                      {item.icon}
                    </span>
                    {!isCollapsed && (
                      <span className="text-sm font-medium leading-normal truncate">{item.label}</span>
                    )}
                    {!isCollapsed && item.badge && (
                      <span className="ml-auto bg-[#137fec] text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="mt-auto">
          {/* Language toggle */}
          <div className={`border-t border-gray-100 ${isCollapsed ? 'px-3 py-3' : 'px-4 py-3'}`}>
            <div className={isCollapsed ? 'flex justify-center' : ''}>
              <LanguageToggle variant="minimal" className={isCollapsed ? '' : 'w-full justify-center'} />
            </div>
          </div>

          {/* User profile card */}
          <div className={`border-t border-gray-100 bg-gray-50/80 ${isCollapsed ? 'p-3' : 'p-4'}`}>
            <div className={`
              flex items-center gap-3 
              ${isCollapsed ? 'justify-center' : 'p-3 bg-white rounded-xl border border-gray-100 shadow-sm'}
            `}>
              {/* Avatar */}
              <div className={`
                bg-[#137fec] rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm overflow-hidden
                ${isCollapsed ? 'w-10 h-10 text-sm' : 'w-11 h-11 text-base'}
              `}>
                {profilePicture ? (
                  <img
                    src={profilePicture}
                    alt={getDisplayName()}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getDisplayName().charAt(0).toUpperCase()
                )}
              </div>

              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{getDisplayName()}</p>
                    <p className="text-xs text-gray-500 truncate">{getDisplayEmail()}</p>
                  </div>

                  <button
                    onClick={onLogout}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title={t('common.logout')}
                  >
                    <span className="material-symbols-outlined text-lg">logout</span>
                  </button>
                </>
              )}
            </div>

            {/* Logout button when collapsed */}
            {isCollapsed && (
              <button
                onClick={onLogout}
                className="mt-2 w-full flex items-center justify-center p-3 rounded-xl text-gray-500 hover:bg-white hover:text-red-500 transition-all"
                title={t('common.logout')}
              >
                <span className="material-symbols-outlined text-xl">logout</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
