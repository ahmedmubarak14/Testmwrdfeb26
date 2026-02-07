import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../../hooks/useToast';
import { Product, User } from '../../../types/types';

type ApprovalDateFilter = 'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_YEAR';

interface AdminApprovalsViewProps {
  products: Product[];
  users: User[];
  onApproveProduct: (productId: string) => void;
  onRejectProduct: (productId: string) => void;
  exportToCSV: (data: any[], filename: string) => void;
  openAdminNotifications: () => void;
  openAdminHelp: () => void;
  renderAdminOverlay: () => React.ReactNode;
}

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (value?: string) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().split('T')[0] : null;
};

const matchesRelativeDateFilter = (value: string | undefined, filter: ApprovalDateFilter) => {
  if (filter === 'ALL') return true;
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  if (filter === 'THIS_YEAR') return date.getFullYear() === now.getFullYear();
  const days = filter === 'LAST_7_DAYS' ? 7 : 30;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
};

export const AdminApprovalsView: React.FC<AdminApprovalsViewProps> = ({
  products,
  users,
  onApproveProduct,
  onRejectProduct,
  exportToCSV,
  openAdminNotifications,
  openAdminHelp,
  renderAdminOverlay,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [approvalSearchTerm, setApprovalSearchTerm] = useState('');
  const [approvalSupplierFilter, setApprovalSupplierFilter] = useState('ALL');
  const [approvalCategoryFilter, setApprovalCategoryFilter] = useState('ALL');
  const [approvalDateFilter, setApprovalDateFilter] = useState<ApprovalDateFilter>('ALL');
  const [selectedApprovalProductIds, setSelectedApprovalProductIds] = useState<string[]>([]);
  const [approvalInfoProductId, setApprovalInfoProductId] = useState<string | null>(null);

  const pendingProducts = products.filter((p) => p.status === 'PENDING');
  const pendingRows = pendingProducts.map((product) => {
    const supplier = users.find((u) => u.id === product.supplierId);
    const productRecord = product as Product & {
      submittedAt?: string;
      submitted_at?: string;
      createdAt?: string;
      created_at?: string;
      updatedAt?: string;
      updated_at?: string;
    };
    const submittedAtRaw = productRecord.submittedAt
      || productRecord.submitted_at
      || productRecord.createdAt
      || productRecord.created_at
      || productRecord.updatedAt
      || productRecord.updated_at;
    return {
      product,
      supplierName: supplier?.companyName || t('admin.approvals.unknownSupplier'),
      submittedAt: toDateKey(submittedAtRaw) || undefined,
    };
  });

  const supplierOptions = Array.from(new Set(pendingRows.map((row) => row.supplierName))).sort();
  const categoryOptions = Array.from(new Set(pendingRows.map((row) => row.product.category))).sort();
  const searchQuery = approvalSearchTerm.trim().toLowerCase();
  const filteredRows = pendingRows.filter((row) => {
    const matchesSearch = !searchQuery || [
      row.product.name,
      row.product.sku || '',
      row.product.category,
      row.supplierName,
    ].join(' ').toLowerCase().includes(searchQuery);
    const matchesSupplier = approvalSupplierFilter === 'ALL' || row.supplierName === approvalSupplierFilter;
    const matchesCategory = approvalCategoryFilter === 'ALL' || row.product.category === approvalCategoryFilter;
    const matchesDate = matchesRelativeDateFilter(row.submittedAt, approvalDateFilter);
    return matchesSearch && matchesSupplier && matchesCategory && matchesDate;
  });

  const visibleIds = filteredRows.map((row) => row.product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedApprovalProductIds.includes(id));
  const selectedVisibleRows = filteredRows.filter((row) => selectedApprovalProductIds.includes(row.product.id));
  const bulkTargetProducts = selectedVisibleRows.length > 0 ? selectedVisibleRows.map((row) => row.product) : [];
  const infoProduct = approvalInfoProductId ? products.find((product) => product.id === approvalInfoProductId) : null;

  const toggleVisibleSelection = () => {
    setSelectedApprovalProductIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const toggleSingleSelection = (productId: string) => {
    setSelectedApprovalProductIds((prev) => (
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    ));
  };

  const handleApproveSingleProduct = (productId: string) => {
    onApproveProduct(productId);
    setSelectedApprovalProductIds((prev) => prev.filter((id) => id !== productId));
    toast.success(t('admin.approvals.approved') || 'Product approved');
  };

  const handleRejectSingleProduct = (productId: string) => {
    onRejectProduct(productId);
    setSelectedApprovalProductIds((prev) => prev.filter((id) => id !== productId));
    toast.success(t('admin.approvals.rejected') || 'Product rejected');
  };

  const handleApproveAllPendingProducts = (targets: Product[]) => {
    if (targets.length === 0) {
      toast.info(t('admin.approvals.allCaughtUp') || 'No pending products to approve');
      return;
    }
    targets.forEach((product) => onApproveProduct(product.id));
    setSelectedApprovalProductIds((prev) => prev.filter((id) => !targets.some((product) => product.id === id)));
    toast.success(t('admin.approvals.bulkApproved') || 'All pending products approved');
  };

  const handleRejectAllPendingProducts = (targets: Product[]) => {
    if (targets.length === 0) {
      toast.info(t('admin.approvals.allCaughtUp') || 'No pending products to reject');
      return;
    }
    targets.forEach((product) => onRejectProduct(product.id));
    setSelectedApprovalProductIds((prev) => prev.filter((id) => !targets.some((product) => product.id === id)));
    toast.success(t('admin.approvals.bulkRejected') || 'All pending products rejected');
  };

  return (
    <div data-testid="admin-approvals-view" className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark font-display">
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-gray-200 bg-white px-8 py-3 dark:border-b-gray-700 dark:bg-background-dark sticky top-0 z-10">
        <div className="flex items-center gap-8">
          <label className="flex w-full min-w-40 max-w-64 flex-col !h-10">
            <div className="flex h-full w-full flex-1 items-stretch rounded-lg">
              <div className="flex items-center justify-center rounded-l-lg border-r-0 bg-background-light pl-4 text-[#616f89] dark:bg-gray-700">
                <span className="material-symbols-outlined text-xl"> search </span>
              </div>
              <input
                className="form-input flex h-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg rounded-l-none border-l-0 border-none bg-background-light px-4 pl-2 text-base font-normal leading-normal text-[#111318] placeholder:text-[#616f89] focus:outline-0 focus:ring-0 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                placeholder={t('common.search')}
                value={approvalSearchTerm}
                onChange={(event) => setApprovalSearchTerm(event.target.value)}
              />
            </div>
          </label>
        </div>
        <div className="flex flex-1 items-center justify-end gap-4">
          <div className="flex gap-2">
            <button
              onClick={openAdminNotifications}
              className="flex h-10 min-w-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg bg-transparent px-2.5 text-sm font-bold leading-normal tracking-[0.015em] text-[#111318] hover:bg-gray-100 dark:text-white dark:hover:bg-primary/20"
            >
              <span className="material-symbols-outlined text-2xl text-gray-600 dark:text-gray-300"> notifications </span>
            </button>
            <button
              onClick={openAdminHelp}
              className="flex h-10 min-w-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg bg-transparent px-2.5 text-sm font-bold leading-normal tracking-[0.015em] text-[#111318] hover:bg-gray-100 dark:text-white dark:hover:bg-primary/20"
            >
              <span className="material-symbols-outlined text-2xl text-gray-600 dark:text-gray-300"> help </span>
            </button>
          </div>
          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" data-alt="User avatar" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBZdY1np0K0nYpFYxH6huL8l275ppgN8ImHZQIKoc_Q-Gdt8dvGPDTQXs8Sk1_ZeFL04mGg4gzpQP7w3FJGacZ5qaLtQTIw-n4NXot4cb2mner5tdkhl8wHkrR9IpwPWfQL3jRJU3ecz7UwaKbIYbClwI7Q9mG-jNP_Pfj6fPNqIVANhovGgiIDHnnQipZagPuBsEzWwwiBqYaaiyNYMQZpf_Vs3qKXz8AQIhJCYWX5mGuarxkURrH08bJmV1408KQzNVE40LzqWDdX")' }}></div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 lg:p-12">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-72 flex-col gap-2">
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-[#111318] dark:text-white">{t('admin.approvals.productApprovalQueue')}</h1>
              <p className="text-base font-normal leading-normal text-[#616f89] dark:text-gray-400">{filteredRows.length} {t('admin.approvals.itemsAwaitingReview')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRejectAllPendingProducts(bulkTargetProducts)}
                disabled={bulkTargetProducts.length === 0}
                className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-x-2 overflow-hidden rounded-lg bg-white px-4 text-sm font-medium leading-normal text-red-600 ring-1 ring-inset ring-red-300 hover:bg-red-50 dark:bg-transparent dark:text-red-500 dark:ring-red-500 dark:hover:bg-red-500/10"
              >
                {t('admin.approvals.rejectSelected')}
              </button>
              <button
                onClick={() => handleApproveAllPendingProducts(bulkTargetProducts)}
                disabled={bulkTargetProducts.length === 0}
                className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-x-2 overflow-hidden rounded-lg bg-[#135bec] px-4 text-sm font-medium leading-normal text-white hover:bg-[#135bec]/90"
              >
                {t('admin.approvals.approveSelected')}
              </button>
              <button
                onClick={() => exportToCSV(filteredRows.map((row) => row.product), 'pending_products')}
                disabled={filteredRows.length === 0}
                className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-x-2 overflow-hidden rounded-lg bg-white border border-slate-200 px-4 text-sm font-medium leading-normal text-slate-700 hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <span>Export</span>
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-b border-b-gray-200 pb-4 dark:border-b-gray-700">
            <div className="relative">
              <select
                value={approvalSupplierFilter}
                onChange={(event) => setApprovalSupplierFilter(event.target.value)}
                className="h-8 appearance-none rounded-lg bg-white pl-4 pr-8 text-sm font-medium text-[#111318] ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600"
              >
                <option value="ALL">{t('admin.approvals.supplier')} - {t('common.all') || 'All'}</option>
                {supplierOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1.5 text-lg text-[#111318] dark:text-white">expand_more</span>
            </div>
            <div className="relative">
              <select
                value={approvalCategoryFilter}
                onChange={(event) => setApprovalCategoryFilter(event.target.value)}
                className="h-8 appearance-none rounded-lg bg-white pl-4 pr-8 text-sm font-medium text-[#111318] ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600"
              >
                <option value="ALL">{t('admin.approvals.category')} - {t('common.all') || 'All'}</option>
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1.5 text-lg text-[#111318] dark:text-white">expand_more</span>
            </div>
            <div className="relative">
              <select
                value={approvalDateFilter}
                onChange={(event) => setApprovalDateFilter(event.target.value as ApprovalDateFilter)}
                className="h-8 appearance-none rounded-lg bg-white pl-4 pr-8 text-sm font-medium text-[#111318] ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600"
              >
                <option value="ALL">{t('admin.approvals.dateSubmitted')} - {t('common.all') || 'All'}</option>
                <option value="LAST_7_DAYS">Last 7 days</option>
                <option value="LAST_30_DAYS">Last 30 days</option>
                <option value="THIS_YEAR">This year</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1.5 text-lg text-[#111318] dark:text-white">expand_more</span>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-background-dark">
            <table className="min-w-full flex-1">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="w-12 px-6 py-3">
                    <input
                      className="h-4 w-4 rounded border-gray-300 text-[#135bec] focus:ring-[#135bec] dark:border-gray-600 dark:bg-gray-700"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSelection}
                    />
                  </th>
                  <th className="px-6 py-3">{t('admin.approvals.product')}</th>
                  <th className="px-6 py-3">{t('admin.approvals.supplier')}</th>
                  <th className="px-6 py-3">{t('admin.approvals.costPrice')}</th>
                  <th className="px-6 py-3">{t('admin.approvals.submitted')}</th>
                  <th className="relative px-6 py-3"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredRows.map(({ product, supplierName, submittedAt }) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4">
                      <input
                        className="h-4 w-4 rounded border-gray-300 text-[#135bec] focus:ring-[#135bec] dark:border-gray-600 dark:bg-gray-700"
                        type="checkbox"
                        checked={selectedApprovalProductIds.includes(product.id)}
                        onChange={() => toggleSingleSelection(product.id)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-lg w-10" style={{ backgroundImage: `url("${product.image}")` }}></div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#111318] dark:text-white">{product.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">SKU: {product.sku || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{supplierName}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-300">${product.supplierPrice?.toFixed(2)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{submittedAt || '-'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setApprovalInfoProductId(product.id)}
                          className="flex h-8 items-center justify-center gap-1 rounded-md bg-yellow-100 px-3 text-xs font-semibold text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:hover:bg-yellow-500/30 transition-colors"
                        >
                          {t('admin.approvals.info')}
                        </button>
                        <button
                          onClick={() => handleRejectSingleProduct(product.id)}
                          className="flex h-8 items-center justify-center gap-1 rounded-md bg-red-100 px-3 text-xs font-semibold text-red-800 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30 transition-colors"
                        >
                          {t('admin.approvals.reject')}
                        </button>
                        <button
                          onClick={() => handleApproveSingleProduct(product.id)}
                          className="flex h-8 items-center justify-center gap-1 rounded-md bg-green-100 px-3 text-xs font-semibold text-green-800 hover:bg-green-200 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30 transition-colors"
                        >
                          {t('admin.approvals.approve')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-gray-300 text-3xl">check_circle</span>
                      </div>
                      <p className="text-gray-500 font-medium">
                        {pendingProducts.length === 0
                          ? (t('admin.approvals.allCaughtUp') || 'All caught up')
                          : (t('common.noResults') || 'No matching products')}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {infoProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h3 className="text-lg font-bold text-slate-900">{t('admin.approvals.info')}</h3>
              <button
                onClick={() => setApprovalInfoProductId(null)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="grid gap-3 p-4 text-sm text-slate-700">
              <p><span className="font-semibold">Name:</span> {infoProduct.name}</p>
              <p><span className="font-semibold">SKU:</span> {infoProduct.sku || 'N/A'}</p>
              <p><span className="font-semibold">{t('admin.approvals.category')}:</span> {infoProduct.category}</p>
              <p><span className="font-semibold">{t('admin.approvals.costPrice')}:</span> ${infoProduct.supplierPrice?.toFixed(2)}</p>
              <p><span className="font-semibold">Description:</span> {infoProduct.description || '-'}</p>
            </div>
            <div className="flex justify-end border-t border-slate-200 p-4">
              <button
                onClick={() => setApprovalInfoProductId(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                {t('common.close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
      {renderAdminOverlay()}
    </div>
  );
};
