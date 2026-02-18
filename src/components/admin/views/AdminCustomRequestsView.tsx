import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../hooks/useToast';
import { CustomRequestStatus, User, UserRole } from '../../../types/types';
import {
  updateCustomRequestStatus,
  assignCustomRequestToSupplier,
  updateAdminNotes,
  rejectCustomRequest,
  getCustomRequestStats,
} from '../../../services/customItemRequestService';
import { logger } from '../../../utils/logger';
import { api } from '../../../services/api';
import {
  PortalPageHeader,
  PortalPageShell,
} from '../../ui/PortalDashboardShell';

interface CustomRequestRow {
  id: string;
  created_at: string;
  updated_at: string;
  item_name: string;
  description: string;
  category: string | null;
  specifications: string | null;
  quantity: number;
  target_price: number | null;
  currency: string;
  deadline: string | null;
  priority: string;
  status: string;
  admin_notes: string | null;
  assigned_to: string | null;
  rejection_reason: string | null;
  reference_images: string[] | null;
  attachment_urls: string[] | null;
  client_id: string;
  client?: {
    name?: string;
    company_name?: string;
  } | null;
  supplier?: {
    name?: string;
    company_name?: string;
  } | null;
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

export const AdminCustomRequestsView: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { users, loadUsers } = useStore();
  const [requests, setRequests] = useState<CustomRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierUsers, setSupplierUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<CustomRequestRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [assignSupplierId, setAssignSupplierId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [adminNotesText, setAdminNotesText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');

  const suppliers = supplierUsers.filter((u: User) => (
    u.role === UserRole.SUPPLIER
    && u.status !== 'REJECTED'
    && u.status !== 'DEACTIVATED'
  ));

  useEffect(() => {
    fetchRequests();
    loadStats();
  }, []);

  useEffect(() => {
    loadUsers().catch((error) => {
      logger.error('Failed to load users for custom requests view', error);
    });
  }, [loadUsers]);

  useEffect(() => {
    let isActive = true;
    const loadSupplierOptions = async () => {
      const storeSuppliers = users.filter((user) => user.role === UserRole.SUPPLIER);
      if (storeSuppliers.length > 0) {
        if (isActive) setSupplierUsers(storeSuppliers);
      }

      // Refresh directly from API whenever assignment modal opens to avoid stale lists.
      if (!showAssignModal && storeSuppliers.length > 0) return;

      try {
        const supplierRows = await api.getUsersByRole(UserRole.SUPPLIER, { page: 1, pageSize: 1000 });
        if (isActive && supplierRows.length > 0) {
          setSupplierUsers(supplierRows);
        }
      } catch (error) {
        logger.error('Failed to load supplier options for custom request assignment', error);
      }
    };

    void loadSupplierOptions();
    return () => {
      isActive = false;
    };
  }, [showAssignModal, users]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const relationResult = await supabase
        .from('custom_item_requests')
        .select('*, client:client_id(name, company_name), supplier:assigned_to(name, company_name)')
        .order('created_at', { ascending: false });

      let rows = (relationResult.data || []) as CustomRequestRow[];

      if (relationResult.error) {
        logger.warn('Custom request relational query failed, retrying with plain select', relationResult.error);
        const fallbackResult = await supabase
          .from('custom_item_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (fallbackResult.error) {
          throw fallbackResult.error;
        }
        rows = (fallbackResult.data || []) as CustomRequestRow[];
      }

      if (rows.length > 0) {
        const needsHydration = rows.some((row) => !row.client?.name || (row.assigned_to && !row.supplier?.name));

        if (needsHydration) {
          const idsToHydrate = Array.from(
            new Set(
              rows.flatMap((row) => [row.client_id, row.assigned_to].filter(Boolean) as string[])
            )
          );

          let userLookup = new Map<string, User>();
          users.forEach((user) => userLookup.set(user.id, user));

          const missingIds = idsToHydrate.filter((id) => !userLookup.has(id));
          if (missingIds.length > 0) {
            try {
              const chunkSize = 200;
              for (let i = 0; i < missingIds.length; i += chunkSize) {
                const chunk = missingIds.slice(i, i + chunkSize);
                const { data: userRows, error: userLookupError } = await supabase
                  .from('users')
                  .select('*')
                  .in('id', chunk);

                if (userLookupError) {
                  throw userLookupError;
                }

                (userRows || []).forEach((row: any) => {
                  userLookup.set(row.id, {
                    id: row.id,
                    name: row.name,
                    companyName: row.company_name,
                    email: row.email,
                    role: (row.role as UserRole) || UserRole.CLIENT,
                    verified: Boolean(row.verified),
                    publicId: row.public_id || undefined,
                    status: row.status || 'ACTIVE',
                    kycStatus: row.kyc_status || undefined,
                    dateJoined: row.date_joined || row.created_at || new Date().toISOString().slice(0, 10),
                  } as User);
                });
              }
            } catch (error) {
              logger.error('Failed to hydrate custom request user labels from API', error);
            }
          }

          rows = rows.map((row) => {
            const client = userLookup.get(row.client_id);
            const supplier = row.assigned_to ? userLookup.get(row.assigned_to) : null;
            return {
              ...row,
              client: row.client || (client ? { name: client.name, company_name: client.companyName } : null),
              supplier: row.supplier || (supplier ? { name: supplier.name, company_name: supplier.companyName } : null),
            };
          });
        }
      }

      setRequests(rows);
    } catch (err) {
      logger.error('Failed to fetch custom item requests', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getCustomRequestStats();
      setStats(data);
    } catch (err) {
      logger.error('Failed to load stats', err);
    }
  };

  const filteredRequests = statusFilter === 'ALL'
    ? requests
    : requests.filter((r) => r.status === statusFilter);

  const handleAssign = async () => {
    if (!selectedRequest || !assignSupplierId) return;
    const supplier = suppliers.find((item) => item.id === assignSupplierId);
    if (!supplier) {
      toast.error(t('admin.customRequests.invalidSupplier'));
      return;
    }

    try {
      setSubmitting(true);
      await assignCustomRequestToSupplier(selectedRequest.id, assignSupplierId, assignNotes);
      toast.success(t('admin.customRequests.assigned'));
      setShowAssignModal(false);
      setAssignSupplierId('');
      setAssignNotes('');
      setSelectedRequest(null);
      await fetchRequests();
      await loadStats();
    } catch (err) {
      logger.error('Failed to assign request', err);
      toast.error(t('admin.customRequests.assignError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectReason.trim()) return;
    try {
      setSubmitting(true);
      await rejectCustomRequest(selectedRequest.id, rejectReason);
      toast.success(t('admin.customRequests.rejected'));
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedRequest(null);
      await fetchRequests();
      await loadStats();
    } catch (err) {
      logger.error('Failed to reject request', err);
      toast.error(t('admin.customRequests.rejectError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedRequest) return;
    try {
      setSubmitting(true);
      await updateAdminNotes(selectedRequest.id, adminNotesText);
      toast.success(t('admin.customRequests.notesSaved'));
      setShowNotesModal(false);
      setAdminNotesText('');
      setSelectedRequest(null);
      await fetchRequests();
    } catch (err) {
      logger.error('Failed to save notes', err);
      toast.error(t('admin.customRequests.notesError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (requestId: string, newStatus: CustomRequestStatus) => {
    try {
      await updateCustomRequestStatus(requestId, newStatus);
      toast.success(t('admin.customRequests.statusUpdated'));
      await fetchRequests();
      await loadStats();
    } catch (err) {
      logger.error('Failed to update status', err);
      toast.error(t('admin.customRequests.statusError'));
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      UNDER_REVIEW: 'bg-blue-100 text-blue-800',
      ASSIGNED: 'bg-purple-100 text-purple-800',
      QUOTED: 'bg-indigo-100 text-indigo-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      LOW: 'bg-gray-100 text-gray-700',
      MEDIUM: 'bg-blue-100 text-blue-700',
      HIGH: 'bg-orange-100 text-orange-700',
      URGENT: 'bg-red-100 text-red-700',
    };
    return colors[priority] || 'bg-gray-100 text-gray-700';
  };

  const getLocalizedStatusText = (status: string) => {
    const keyByStatus: Record<string, string> = {
      PENDING: 'admin.customRequests.statusPending',
      UNDER_REVIEW: 'admin.customRequests.statusUnderReview',
      ASSIGNED: 'admin.customRequests.statusAssigned',
      QUOTED: 'admin.customRequests.statusQuoted',
      APPROVED: 'admin.customRequests.statusApproved',
      REJECTED: 'admin.customRequests.statusRejected',
      CANCELLED: 'admin.customRequests.statusCancelled',
    };

    return t(keyByStatus[status] || status);
  };

  const getLocalizedPriorityText = (priority: string) => {
    const keyByPriority: Record<string, string> = {
      LOW: 'admin.customRequests.priorityLow',
      MEDIUM: 'admin.customRequests.priorityMedium',
      HIGH: 'admin.customRequests.priorityHigh',
      URGENT: 'admin.customRequests.priorityUrgent',
    };

    return t(keyByPriority[priority] || priority);
  };

  const resolveAttachmentUrl = (value: string): string => {
    if (!value) return '#';
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    if (value.startsWith('storage://')) {
      const storagePath = value.replace('storage://', '');
      const slashIndex = storagePath.indexOf('/');
      if (slashIndex > 0) {
        const bucket = storagePath.slice(0, slashIndex);
        const filePath = storagePath.slice(slashIndex + 1);
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return data.publicUrl;
      }
    }
    return value;
  };

  return (
    <div data-testid="admin-custom-requests-view">
      <PortalPageShell className="animate-in fade-in duration-300">
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.customRequests')}
          subtitle={t('admin.customRequests.subtitle')}
        />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">{t('admin.customRequests.total')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
            <p className="text-xs font-bold text-yellow-600 uppercase">{t('admin.customRequests.pending')}</p>
            <p className="text-2xl font-bold text-yellow-800 mt-1">{stats.byStatus.pending}</p>
          </div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
            <p className="text-xs font-bold text-purple-600 uppercase">{t('admin.customRequests.assignedCount')}</p>
            <p className="text-2xl font-bold text-purple-800 mt-1">{stats.byStatus.assigned}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <p className="text-xs font-bold text-red-600 uppercase">{t('admin.customRequests.urgent')}</p>
            <p className="text-2xl font-bold text-red-800 mt-1">{stats.byPriority.urgent}</p>
          </div>
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {['ALL', 'PENDING', 'UNDER_REVIEW', 'ASSIGNED', 'QUOTED', 'APPROVED', 'REJECTED', 'CANCELLED'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              statusFilter === status
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {status === 'ALL' ? t('common.all') : getLocalizedStatusText(status)}
          </button>
        ))}
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.date')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.item')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.client')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.priority')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.status')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.assignedTo')}</th>
                <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.customRequests.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRequests.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    {t('admin.customRequests.noRequestsFound')}
                  </td>
                </tr>
              )}
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{req.item_name}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[200px]">{req.description}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="flex flex-col">
                      <span className="font-medium">{req.client?.company_name || t('admin.customRequests.unknownCompany')}</span>
                      <span className="text-xs">{req.client?.name || t('admin.customRequests.unknownUser')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getPriorityColor(req.priority)}`}>
                      {getLocalizedPriorityText(req.priority)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(req.status)}`}>
                      {getLocalizedStatusText(req.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm">
                    {req.supplier?.company_name || req.supplier?.name || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      {/* Assign to Supplier */}
                      {(req.status === 'PENDING' || req.status === 'UNDER_REVIEW') && (
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setShowAssignModal(true);
                          }}
                          className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors"
                          title={t('admin.customRequests.assignToSupplier')}
                        >
                          <span className="material-symbols-outlined text-lg">person_add</span>
                        </button>
                      )}
                      {/* View details */}
                      <button
                        onClick={() => {
                          setSelectedRequest(req);
                          setShowDetailsModal(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                        title={t('common.view')}
                      >
                        <span className="material-symbols-outlined text-lg">visibility</span>
                      </button>
                      {/* Admin Notes */}
                      <button
                        onClick={() => {
                          setSelectedRequest(req);
                          setAdminNotesText(req.admin_notes || '');
                          setShowNotesModal(true);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          req.admin_notes ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-50'
                        }`}
                        title={t('admin.customRequests.adminNotes')}
                      >
                        <span className="material-symbols-outlined text-lg">sticky_note_2</span>
                      </button>
                      {/* Mark as Under Review */}
                      {req.status === 'PENDING' && (
                        <button
                          onClick={() => handleStatusChange(req.id, CustomRequestStatus.UNDER_REVIEW)}
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                          title={t('admin.customRequests.markUnderReview')}
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                      )}
                      {/* Reject */}
                      {req.status !== 'REJECTED' && req.status !== 'CANCELLED' && req.status !== 'APPROVED' && (
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setShowRejectModal(true);
                          }}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          title={t('admin.customRequests.reject')}
                        >
                          <span className="material-symbols-outlined text-lg">block</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{t('admin.customRequests.requestDetails')}</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.item')}</p>
                  <p className="font-medium text-gray-900">{selectedRequest.item_name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.category')}</p>
                  <p className="font-medium text-gray-900">{selectedRequest.category || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.client')}</p>
                  <p className="font-medium text-gray-900">{selectedRequest.client?.company_name || selectedRequest.client?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.assignedTo')}</p>
                  <p className="font-medium text-gray-900">{selectedRequest.supplier?.company_name || selectedRequest.supplier?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.quantity')}</p>
                  <p className="font-medium text-gray-900">{selectedRequest.quantity}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.targetPrice')}</p>
                  <p className="font-medium text-gray-900">
                    {selectedRequest.target_price !== null
                      ? `${selectedRequest.currency || 'SAR'} ${Number(selectedRequest.target_price).toFixed(2)}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.priority')}</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getPriorityColor(selectedRequest.priority)}`}>
                    {getLocalizedPriorityText(selectedRequest.priority)}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.status')}</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(selectedRequest.status)}`}>
                    {getLocalizedStatusText(selectedRequest.status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.date')}</p>
                  <p className="font-medium text-gray-900">{new Date(selectedRequest.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.deadline')}</p>
                  <p className="font-medium text-gray-900">
                    {selectedRequest.deadline ? new Date(selectedRequest.deadline).toLocaleDateString() : '-'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('admin.customRequests.description')}</p>
                <p className="text-gray-800 whitespace-pre-wrap">{selectedRequest.description}</p>
              </div>

              {selectedRequest.specifications && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('admin.customRequests.specifications')}</p>
                  <p className="text-gray-800 whitespace-pre-wrap">{selectedRequest.specifications}</p>
                </div>
              )}

              {selectedRequest.admin_notes && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('admin.customRequests.adminNotes')}</p>
                  <p className="text-gray-800 whitespace-pre-wrap">{selectedRequest.admin_notes}</p>
                </div>
              )}

              {selectedRequest.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-600 uppercase mb-1">{t('admin.customRequests.rejectionReason')}</p>
                  <p className="text-red-700 whitespace-pre-wrap">{selectedRequest.rejection_reason}</p>
                </div>
              )}

              {(selectedRequest.reference_images?.length || selectedRequest.attachment_urls?.length) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.customRequests.attachments')}</p>
                  <div className="flex flex-wrap gap-2">
                    {[...(selectedRequest.reference_images || []), ...(selectedRequest.attachment_urls || [])].map((url, idx) => (
                      <a
                        key={`${url}-${idx}`}
                        href={resolveAttachmentUrl(String(url))}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        <span className="material-symbols-outlined text-sm">attachment</span>
                        {t('admin.customRequests.openAttachment')} #{idx + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Supplier Modal */}
      {showAssignModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('admin.customRequests.assignToSupplier')}</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {t('admin.customRequests.assignDesc')} <strong>{selectedRequest.item_name}</strong>
            </p>
            <div>
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder={t('admin.customRequests.searchSuppliers')}
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 mb-2"
              />
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {suppliers
                  .filter((s: User) =>
                    !supplierSearch ||
                    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                    s.companyName?.toLowerCase().includes(supplierSearch.toLowerCase())
                  )
                  .map((supplier: User) => (
                    <button
                      key={supplier.id}
                      onClick={() => setAssignSupplierId(supplier.id)}
                      className={`w-full text-left p-3 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                        assignSupplierId === supplier.id ? 'bg-purple-50 border-l-2 border-l-purple-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-medium text-gray-900">{supplier.companyName || supplier.name}</p>
                      <p className="text-xs text-gray-500">{supplier.email}</p>
                    </button>
                  ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.customRequests.notesOptional')}</label>
              <textarea
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                rows={2}
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                placeholder={t('admin.customRequests.assignNotesPlaceholder')}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignSupplierId || submitting}
                className="px-4 py-2 text-sm font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? t('common.assigning') : t('admin.customRequests.assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRejectModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('admin.customRequests.rejectRequest')}</h3>
              <button onClick={() => setShowRejectModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {t('admin.customRequests.rejectDesc')} <strong>{selectedRequest.item_name}</strong>
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500"
              placeholder={t('admin.customRequests.rejectReasonPlaceholder')}
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || submitting}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? t('common.rejecting') : t('admin.customRequests.confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Notes Modal */}
      {showNotesModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNotesModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('admin.customRequests.adminNotes')}</h3>
              <button onClick={() => setShowNotesModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {t('admin.customRequests.notesFor')} <strong>{selectedRequest.item_name}</strong>
            </p>
            <textarea
              value={adminNotesText}
              onChange={(e) => setAdminNotesText(e.target.value)}
              rows={4}
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('admin.customRequests.notesPlaceholder')}
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNotesModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={submitting}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      </PortalPageShell>
    </div>
  );
};
