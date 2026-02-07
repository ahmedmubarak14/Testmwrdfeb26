import React from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '../../ui/StatusBadge';
import { CreditLimitAdjustmentType, User, UserRole } from '../../../types/types';

interface AdminUsersViewProps {
  users: User[];
  userViewMode: 'suppliers' | 'clients';
  onUserViewModeChange: (mode: 'suppliers' | 'clients') => void;
  usersGlobalSearchTerm: string;
  onUsersGlobalSearchTermChange: (value: string) => void;
  supplierSearchTerm: string;
  onSupplierSearchTermChange: (value: string) => void;
  supplierStatusFilter: 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION';
  onSupplierStatusFilterChange: (value: 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION') => void;
  clientSearchTerm: string;
  onClientSearchTermChange: (value: string) => void;
  clientStatusFilter: 'ALL' | 'ACTIVE' | 'PENDING' | 'DEACTIVATED';
  onClientStatusFilterChange: (value: 'ALL' | 'ACTIVE' | 'PENDING' | 'DEACTIVATED') => void;
  clientDateRangeFilter: 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR';
  onClientDateRangeFilterChange: (value: 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR') => void;
  clientPage: number;
  onClientPageChange: (page: number) => void;
  matchesRelativeDateFilter: (value: string | undefined, filter: 'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR') => boolean;
  creditLimitFormatter: Intl.NumberFormat;
  onOpenAdminNotifications: () => void;
  onOpenAddUser: (type: 'supplier' | 'client') => void;
  onOpenUserAction: (user: User) => void;
  onConvertRole: (userId: string, newRole: UserRole) => void;
  onOpenClientMarginModal: (client: User) => void;
  onOpenCreditAdjustModal: (client: User, mode: CreditLimitAdjustmentType) => void;
  onOpenCreditHistoryModal: (client: User) => void;
  exportToCSV: (data: any[], filename: string) => void;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  users,
  userViewMode,
  onUserViewModeChange,
  usersGlobalSearchTerm,
  onUsersGlobalSearchTermChange,
  supplierSearchTerm,
  onSupplierSearchTermChange,
  supplierStatusFilter,
  onSupplierStatusFilterChange,
  clientSearchTerm,
  onClientSearchTermChange,
  clientStatusFilter,
  onClientStatusFilterChange,
  clientDateRangeFilter,
  onClientDateRangeFilterChange,
  clientPage,
  onClientPageChange,
  matchesRelativeDateFilter,
  creditLimitFormatter,
  onOpenAdminNotifications,
  onOpenAddUser,
  onOpenUserAction,
  onConvertRole,
  onOpenClientMarginModal,
  onOpenCreditAdjustModal,
  onOpenCreditHistoryModal,
  exportToCSV,
}) => {
  const { t } = useTranslation();
  const supplierUsers = users.filter((u) => u.role === UserRole.SUPPLIER && u.status);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      APPROVED: 'approved',
      PENDING: 'pending',
      REJECTED: 'rejected',
      REQUIRES_ATTENTION: 'requires_attention',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  const getKycBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      VERIFIED: 'verified',
      IN_REVIEW: 'in_review',
      REJECTED: 'rejected',
      INCOMPLETE: 'incomplete',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  const globalQuery = usersGlobalSearchTerm.trim().toLowerCase();
  const filteredSupplierUsers = supplierUsers.filter((user) => {
    const searchable = `${user.name || ''} ${user.companyName || ''} ${user.email || ''}`.toLowerCase();
    const localQuery = supplierSearchTerm.trim().toLowerCase();
    const matchesGlobalSearch = !globalQuery || searchable.includes(globalQuery);
    const matchesLocalSearch = !localQuery || searchable.includes(localQuery);
    const matchesStatus = supplierStatusFilter === 'ALL' || user.status === supplierStatusFilter;
    return matchesGlobalSearch && matchesLocalSearch && matchesStatus;
  });

  const clientUsers = users.filter((u) => u.role === UserRole.CLIENT && u.status);
  const getClientStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      ACTIVE: 'active',
      PENDING: 'pending',
      DEACTIVATED: 'deactivated',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  const filteredClientUsers = clientUsers.filter((client) => {
    const searchable = `${client.name || ''} ${client.companyName || ''} ${client.email || ''}`.toLowerCase();
    const localQuery = clientSearchTerm.trim().toLowerCase();
    const matchesGlobalSearch = !globalQuery || searchable.includes(globalQuery);
    const matchesLocalSearch = !localQuery || searchable.includes(localQuery);
    const matchesStatus = clientStatusFilter === 'ALL' || client.status === clientStatusFilter;
    const matchesDate = matchesRelativeDateFilter(client.dateJoined, clientDateRangeFilter);
    return matchesGlobalSearch && matchesLocalSearch && matchesStatus && matchesDate;
  });

  const clientsPerPage = 8;
  const totalClientPages = Math.max(1, Math.ceil(filteredClientUsers.length / clientsPerPage));
  const currentClientPage = Math.min(clientPage, totalClientPages);
  const paginatedClientUsers = filteredClientUsers.slice(
    (currentClientPage - 1) * clientsPerPage,
    currentClientPage * clientsPerPage
  );
  const clientStart = filteredClientUsers.length === 0 ? 0 : ((currentClientPage - 1) * clientsPerPage) + 1;
  const clientEnd = Math.min(currentClientPage * clientsPerPage, filteredClientUsers.length);

  return (
    <div data-testid="admin-users-view" className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark font-display">
      <header className="flex sticky top-0 z-10 items-center justify-between whitespace-nowrap border-b border-solid border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-background-dark/80 backdrop-blur-sm px-8 py-3">
        <div className="flex-1"></div>
        <div className="flex flex-1 justify-end items-center gap-4">
          <label className="flex flex-col min-w-40 !h-10 max-w-64">
            <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
              <div className="text-[#616f89] dark:text-gray-400 flex bg-gray-100 dark:bg-gray-800 items-center justify-center pl-3 rounded-l-lg">
                <span className="material-symbols-outlined text-xl">search</span>
              </div>
              <input
                className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-gray-800 dark:text-gray-200 focus:outline-0 focus:ring-0 border-none bg-gray-100 dark:bg-gray-800 h-full placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-2 text-sm"
                placeholder={t('admin.users.globalSearch')}
                value={usersGlobalSearchTerm}
                onChange={(event) => onUsersGlobalSearchTermChange(event.target.value)}
              />
            </div>
          </label>
          <div className="flex gap-2">
            <button
              onClick={onOpenAdminNotifications}
              className="flex cursor-pointer items-center justify-center rounded-lg h-10 w-10 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            >
              <span className="material-symbols-outlined text-xl">notifications</span>
            </button>
          </div>
          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAJ7fHXw9w99tcCAF8HBhK1huQwUZ07R3_NvN5poow1YURUP0c5X3bRBhYLgHdzwmD0eMnEbhAqhMCnsWTT3-aXbUpmz44qLvn0sxbOm361wtpRiXSz67tLD3GhhdoZhSMW6lNSPjOGM4x1JofOq6VDhXJNHUR-ZHANS80HMBtNctQItZsn_ND2ix5MmY19C4QZ9OPSOvmv8TepWM7dsS25O7YBr-3_o2_L-khhnsssZOYeBz-HJDP0yyjlWqAyMyM7rV6zKaHaBPBz")' }}></div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 lg:p-12">
        <div className="flex justify-center mb-8">
          <div className="bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 inline-flex shadow-sm">
            <button
              onClick={() => onUserViewModeChange('suppliers')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${userViewMode === 'suppliers' ? 'bg-[#135bec] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <span className="material-symbols-outlined text-lg">storefront</span>
              {t('admin.users.suppliers')}
            </button>
            <button
              onClick={() => onUserViewModeChange('clients')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${userViewMode === 'clients' ? 'bg-[#135bec] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
              {t('admin.users.clients')}
            </button>
          </div>
        </div>

        {userViewMode === 'suppliers' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <p className="text-gray-900 dark:text-white text-3xl font-bold tracking-tight">{t('admin.users.supplierManagement')}</p>
              <button
                onClick={() => onOpenAddUser('supplier')}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
              >
                <span className="material-symbols-outlined mr-2 text-lg">add</span>
                <span>{t('admin.users.addSupplier')}</span>
              </button>
            </div>

            <div className="flex justify-between items-center gap-2 p-4 bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex gap-2 items-center">
                <label className="flex flex-col min-w-40 !h-10 max-w-64">
                  <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                    <div className="text-[#616f89] dark:text-gray-400 flex bg-gray-100 dark:bg-gray-800 items-center justify-center pl-3 rounded-l-lg">
                      <span className="material-symbols-outlined text-xl">search</span>
                    </div>
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-gray-800 dark:text-gray-200 focus:outline-0 focus:ring-0 border-none bg-gray-100 dark:bg-gray-800 h-full placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-2 text-sm"
                      placeholder={t('admin.users.searchSuppliers')}
                      value={supplierSearchTerm}
                      onChange={(event) => onSupplierSearchTermChange(event.target.value)}
                    />
                  </div>
                </label>
                <div className="relative">
                  <select
                    value={supplierStatusFilter}
                    onChange={(event) => onSupplierStatusFilterChange(event.target.value as 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION')}
                    className="h-10 appearance-none rounded-lg bg-gray-100 pl-3 pr-8 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    <option value="ALL">{t('admin.users.filter')} - {t('common.all') || 'All'}</option>
                    <option value="APPROVED">{t('common.approved') || 'Approved'}</option>
                    <option value="PENDING">{t('common.pending') || 'Pending'}</option>
                    <option value="REJECTED">{t('common.rejected') || 'Rejected'}</option>
                    <option value="REQUIRES_ATTENTION">{t('admin.users.requiresAttention') || 'Requires Attention'}</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2 text-xl text-gray-500 dark:text-gray-300">expand_more</span>
                </div>
              </div>
              <button
                onClick={() => exportToCSV(filteredSupplierUsers, 'suppliers_export')}
                className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 gap-2 text-sm font-bold min-w-0 px-4"
              >
                <span className="material-symbols-outlined text-lg">download</span>
                <span className="truncate">{t('admin.users.export')}</span>
              </button>
            </div>

            <div className="mt-2 @container">
              <div className="flex overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                <table className="w-full text-left">
                  <thead className="border-b border-gray-200 dark:border-gray-800">
                    <tr className="bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 w-12 text-center">
                        <input className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-transparent text-primary focus:ring-primary/50" type="checkbox" />
                      </th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.supplierName')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.status')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.kycStatus')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.dateJoined')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {filteredSupplierUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-4 py-2 w-12 text-center">
                          <input className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-transparent text-primary focus:ring-primary/50" type="checkbox" />
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">{user.companyName}</td>
                        <td className="px-4 py-2 text-sm">
                          {getStatusBadge(user.status || 'PENDING')}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {getKycBadge(user.kycStatus || 'INCOMPLETE')}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{user.dateJoined}</td>
                        <td className="px-4 py-2 text-sm font-medium text-primary cursor-pointer hover:underline">
                          <div className="flex items-center gap-2">
                            <span onClick={() => onOpenUserAction(user)}>{t('admin.users.review')}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onConvertRole(user.id, UserRole.CLIENT); }}
                              className="p-1 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Convert to Client"
                            >
                              <span className="material-symbols-outlined text-[20px]">switch_account</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredSupplierUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                          {t('common.noResults') || 'No matching suppliers'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {userViewMode === 'clients' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-text-light dark:text-text-dark text-3xl font-black tracking-tight">{t('admin.users.clientManagement')}</p>
              <button
                onClick={() => onOpenAddUser('client')}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg"
              >
                <span className="material-symbols-outlined !text-xl">add</span>
                <span className="truncate">{t('admin.users.addClient')}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-light dark:border-border-dark bg-content-light dark:bg-content-dark p-4">
              <div className="flex items-center gap-2 flex-1 min-w-64">
                <label className="flex flex-col w-full">
                  <div className="flex w-full flex-1 items-stretch rounded-lg h-10">
                    <div className="text-subtext-light dark:text-subtext-dark flex border-none bg-background-light dark:bg-background-dark items-center justify-center pl-3.5 rounded-l-lg border-r-0">
                      <span className="material-symbols-outlined !text-xl">search</span>
                    </div>
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-light dark:text-text-dark focus:outline-0 focus:ring-2 focus:ring-primary/50 border-none bg-background-light dark:bg-background-dark h-full placeholder:text-subtext-light dark:placeholder:text-subtext-dark px-4 rounded-l-none border-l-0 pl-2 text-sm"
                      placeholder={t('admin.users.searchClients')}
                      value={clientSearchTerm}
                      onChange={(event) => onClientSearchTermChange(event.target.value)}
                    />
                  </div>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={clientStatusFilter}
                    onChange={(event) => onClientStatusFilterChange(event.target.value as 'ALL' | 'ACTIVE' | 'PENDING' | 'DEACTIVATED')}
                    className="h-10 appearance-none rounded-lg border border-border-light bg-transparent pl-3 pr-8 text-sm font-medium text-subtext-light hover:bg-primary/10 dark:border-border-dark dark:text-subtext-dark"
                  >
                    <option value="ALL">{t('admin.users.statusAll')}</option>
                    <option value="ACTIVE">{t('admin.users.active') || 'Active'}</option>
                    <option value="PENDING">{t('common.pending') || 'Pending'}</option>
                    <option value="DEACTIVATED">{t('admin.users.deactivated') || 'Deactivated'}</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2 !text-xl">expand_more</span>
                </div>
                <div className="relative">
                  <select
                    value={clientDateRangeFilter}
                    onChange={(event) => onClientDateRangeFilterChange(event.target.value as 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR')}
                    className="h-10 appearance-none rounded-lg border border-border-light bg-transparent pl-3 pr-8 text-sm font-medium text-subtext-light hover:bg-primary/10 dark:border-border-dark dark:text-subtext-dark"
                  >
                    <option value="ALL">{t('admin.users.dateRange')}</option>
                    <option value="LAST_30_DAYS">Last 30 days</option>
                    <option value="LAST_90_DAYS">Last 90 days</option>
                    <option value="THIS_YEAR">This year</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2 !text-xl">expand_more</span>
                </div>
                <button disabled className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg h-10 px-4 bg-transparent text-subtext-light dark:text-subtext-dark text-sm font-medium border border-border-light dark:border-border-dark hover:bg-primary/10 opacity-50 cursor-not-allowed">
                  <span className="truncate">{t('admin.users.bulkActions')}</span>
                  <span className="material-symbols-outlined !text-xl">expand_more</span>
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border-light dark:border-border-dark bg-content-light dark:bg-content-dark">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark/50">
                    <tr>
                      <th className="px-4 py-3 text-center w-12">
                        <input className="h-5 w-5 rounded border-2 border-border-light dark:border-border-dark bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0" type="checkbox" />
                      </th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.clientName')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.company')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.email')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.status')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.creditLimit') || 'Credit Limit'}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.margin') || 'Client Margin'}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.dateJoined')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark text-right">{t('admin.users.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-text-light dark:text-text-dark">
                    {paginatedClientUsers.map((client) => (
                      <tr key={client.id} className="border-b border-border-light dark:border-border-dark last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="h-[72px] px-4 py-2 text-center w-12">
                          <input className="h-5 w-5 rounded border-2 border-border-light dark:border-border-dark bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0" type="checkbox" />
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm font-medium">{client.name}</td>
                        <td className="h-[72px] px-4 py-2 text-sm text-subtext-light dark:text-subtext-dark">{client.companyName}</td>
                        <td className="h-[72px] px-4 py-2 text-sm text-subtext-light dark:text-subtext-dark">{client.email}</td>
                        <td className="h-[72px] px-4 py-2 text-sm">
                          {getClientStatusBadge(client.status || 'PENDING')}
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm font-semibold">
                          {creditLimitFormatter.format(Number(client.creditLimit || 0))}
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm font-medium text-subtext-light dark:text-subtext-dark">
                          {client.clientMargin !== undefined ? `${client.clientMargin}%` : '-'}
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm text-subtext-light dark:text-subtext-dark">{client.dateJoined}</td>
                        <td className="h-[72px] px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onOpenClientMarginModal(client)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              title="Set Client Margin"
                            >
                              Margin
                            </button>
                            <button
                              data-testid={`admin-client-credit-set-${client.id}`}
                              onClick={() => onOpenCreditAdjustModal(client, 'SET')}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              {t('common.set') || 'Set'}
                            </button>
                            <button
                              data-testid={`admin-client-credit-increase-${client.id}`}
                              onClick={() => onOpenCreditAdjustModal(client, 'INCREASE')}
                              className="p-1.5 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                              title={t('admin.users.increaseCredit') || 'Increase credit'}
                            >
                              <span className="material-symbols-outlined text-base">add</span>
                            </button>
                            <button
                              data-testid={`admin-client-credit-decrease-${client.id}`}
                              onClick={() => onOpenCreditAdjustModal(client, 'DECREASE')}
                              className="p-1.5 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20"
                              title={t('admin.users.decreaseCredit') || 'Decrease credit'}
                            >
                              <span className="material-symbols-outlined text-base">remove</span>
                            </button>
                            <button
                              data-testid={`admin-client-credit-history-${client.id}`}
                              onClick={() => onOpenCreditHistoryModal(client)}
                              className="p-1.5 rounded-md border border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/20"
                              title={t('admin.users.creditLimitHistory') || 'Credit limit history'}
                            >
                              <span className="material-symbols-outlined text-base">history</span>
                            </button>
                            <button
                              onClick={() => onOpenUserAction(client)}
                              className="p-2 text-subtext-light dark:text-subtext-dark rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              <span className="material-symbols-outlined">more_horiz</span>
                            </button>
                            <button
                              onClick={() => onConvertRole(client.id, UserRole.SUPPLIER)}
                              className="p-1 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors"
                              title="Convert to Supplier"
                            >
                              <span className="material-symbols-outlined text-[20px]">switch_account</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paginatedClientUsers.length === 0 && (
                      <tr>
                        <td colSpan={9} className="h-[72px] px-4 py-2 text-center text-sm text-subtext-light dark:text-subtext-dark">
                          {t('common.noResults') || 'No matching clients'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-t border-border-light dark:border-border-dark">
                <p className="text-sm text-subtext-light dark:text-subtext-dark">
                  {t('admin.users.showingResults', { count: clientEnd - clientStart + (clientStart === 0 ? 0 : 1), total: filteredClientUsers.length })}
                  {' '}
                  ({clientStart}-{clientEnd})
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center justify-center rounded-lg size-9 border border-border-light dark:border-border-dark text-subtext-light dark:text-subtext-dark hover:bg-primary/10 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={currentClientPage <= 1}
                    onClick={() => onClientPageChange(Math.max(1, currentClientPage - 1))}
                  >
                    <span className="material-symbols-outlined !text-xl">chevron_left</span>
                  </button>
                  <button disabled className="flex items-center justify-center rounded-lg size-9 border border-primary bg-primary/20 text-primary font-bold">
                    {currentClientPage}
                  </button>
                  <button
                    onClick={() => onClientPageChange(Math.min(totalClientPages, currentClientPage + 1))}
                    disabled={currentClientPage >= totalClientPages}
                    className="flex items-center justify-center rounded-lg size-9 border border-border-light dark:border-border-dark text-subtext-light dark:text-subtext-dark hover:bg-primary/10 hover:text-primary"
                  >
                    <span className="material-symbols-outlined !text-xl">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
