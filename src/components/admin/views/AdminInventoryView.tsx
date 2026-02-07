import React from 'react';
import { InventoryDashboard } from '../InventoryDashboard';

export const AdminInventoryView: React.FC = () => {
  return (
    <div className="p-4 md:p-8 lg:p-12">
      <InventoryDashboard />
    </div>
  );
};
