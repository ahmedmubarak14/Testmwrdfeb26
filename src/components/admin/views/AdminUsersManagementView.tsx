import React from 'react';
import { AddUserModal } from '../AddUserModal';
import { UserActionModal } from '../UserActionModal';
import { CreditLimitAdjustmentModal } from '../CreditLimitAdjustmentModal';
import { CreditLimitHistoryModal } from '../CreditLimitHistoryModal';
import { ClientMarginModal } from '../ClientMarginModal';
import { AdminUsersView } from './AdminUsersView';
import { CreditLimitAdjustment, CreditLimitAdjustmentType, User, UserRole } from '../../../types/types';

interface AdminUsersManagementViewProps {
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
  renderAdminOverlay: () => React.ReactNode;
  isClientMarginModalOpen: boolean;
  onCloseClientMarginModal: () => void;
  clientMarginClient: User | null;
  onSaveClientMargin: (clientId: string, margin: number) => Promise<void>;
  isClientMarginSubmitting: boolean;
  isCreditAdjustModalOpen: boolean;
  onCloseCreditAdjustModal: () => void;
  creditAdjustClient: User | null;
  creditAdjustMode: CreditLimitAdjustmentType;
  onSubmitCreditAdjustment: (payload: { amount: number; reason: string }) => Promise<void>;
  isCreditAdjustSubmitting: boolean;
  isCreditHistoryModalOpen: boolean;
  onCloseCreditHistoryModal: () => void;
  creditHistoryClientName: string;
  creditHistoryEntries: CreditLimitAdjustment[];
  isCreditHistoryLoading: boolean;
  isAddUserModalOpen: boolean;
  onCloseAddUserModal: () => void;
  addUserType: 'supplier' | 'client';
  onCreateUser: (userData: any) => Promise<void>;
  selectedUserForAction: User | null;
  isUserActionModalOpen: boolean;
  onCloseUserActionModal: () => void;
  onUpdateUserStatus: (userId: string, status: any, kycStatus?: any) => Promise<void>;
}

export const AdminUsersManagementView: React.FC<AdminUsersManagementViewProps> = ({
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
  renderAdminOverlay,
  isClientMarginModalOpen,
  onCloseClientMarginModal,
  clientMarginClient,
  onSaveClientMargin,
  isClientMarginSubmitting,
  isCreditAdjustModalOpen,
  onCloseCreditAdjustModal,
  creditAdjustClient,
  creditAdjustMode,
  onSubmitCreditAdjustment,
  isCreditAdjustSubmitting,
  isCreditHistoryModalOpen,
  onCloseCreditHistoryModal,
  creditHistoryClientName,
  creditHistoryEntries,
  isCreditHistoryLoading,
  isAddUserModalOpen,
  onCloseAddUserModal,
  addUserType,
  onCreateUser,
  selectedUserForAction,
  isUserActionModalOpen,
  onCloseUserActionModal,
  onUpdateUserStatus,
}) => {
  return (
    <>
      <AdminUsersView
        users={users}
        userViewMode={userViewMode}
        onUserViewModeChange={onUserViewModeChange}
        usersGlobalSearchTerm={usersGlobalSearchTerm}
        onUsersGlobalSearchTermChange={onUsersGlobalSearchTermChange}
        supplierSearchTerm={supplierSearchTerm}
        onSupplierSearchTermChange={onSupplierSearchTermChange}
        supplierStatusFilter={supplierStatusFilter}
        onSupplierStatusFilterChange={onSupplierStatusFilterChange}
        clientSearchTerm={clientSearchTerm}
        onClientSearchTermChange={onClientSearchTermChange}
        clientStatusFilter={clientStatusFilter}
        onClientStatusFilterChange={onClientStatusFilterChange}
        clientDateRangeFilter={clientDateRangeFilter}
        onClientDateRangeFilterChange={onClientDateRangeFilterChange}
        clientPage={clientPage}
        onClientPageChange={onClientPageChange}
        matchesRelativeDateFilter={matchesRelativeDateFilter}
        creditLimitFormatter={creditLimitFormatter}
        onOpenAdminNotifications={onOpenAdminNotifications}
        onOpenAddUser={onOpenAddUser}
        onOpenUserAction={onOpenUserAction}
        onConvertRole={onConvertRole}
        onOpenClientMarginModal={onOpenClientMarginModal}
        onOpenCreditAdjustModal={onOpenCreditAdjustModal}
        onOpenCreditHistoryModal={onOpenCreditHistoryModal}
        exportToCSV={exportToCSV}
      />
      {renderAdminOverlay()}

      <ClientMarginModal
        isOpen={isClientMarginModalOpen}
        onClose={onCloseClientMarginModal}
        client={clientMarginClient}
        onSave={onSaveClientMargin}
        isLoading={isClientMarginSubmitting}
      />

      <CreditLimitAdjustmentModal
        isOpen={isCreditAdjustModalOpen}
        onClose={onCloseCreditAdjustModal}
        client={creditAdjustClient}
        mode={creditAdjustMode}
        onSubmit={onSubmitCreditAdjustment}
        isSubmitting={isCreditAdjustSubmitting}
      />

      <CreditLimitHistoryModal
        isOpen={isCreditHistoryModalOpen}
        onClose={onCloseCreditHistoryModal}
        clientName={creditHistoryClientName}
        entries={creditHistoryEntries}
        isLoading={isCreditHistoryLoading}
      />

      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={onCloseAddUserModal}
        type={addUserType}
        onSave={onCreateUser}
      />

      {selectedUserForAction && (
        <UserActionModal
          isOpen={isUserActionModalOpen}
          onClose={onCloseUserActionModal}
          user={selectedUserForAction}
          onUpdateStatus={onUpdateUserStatus}
        />
      )}
    </>
  );
};
