import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../../hooks/useToast';
import { logisticsService } from '../../../services/logisticsService';
import { Order, OrderStatus, ShipmentDetails, User, UserRole } from '../../../types/types';
import { logger } from '../../../utils/logger';

interface AdminLogisticsViewProps {
  orders: Order[];
  users: User[];
  orderStatusBadgeClasses: Record<string, string>;
  onRefreshOrders: () => Promise<void> | void;
}

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const AdminLogisticsView: React.FC<AdminLogisticsViewProps> = ({
  orders,
  users,
  orderStatusBadgeClasses,
  onRefreshOrders,
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [dispatchOrderId, setDispatchOrderId] = useState<string | null>(null);
  const [dispatchCarrier, setDispatchCarrier] = useState('');
  const [dispatchTrackingNumber, setDispatchTrackingNumber] = useState('');
  const [dispatchTrackingUrl, setDispatchTrackingUrl] = useState('');
  const [dispatchEstimatedDeliveryDate, setDispatchEstimatedDeliveryDate] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isDispatchSubmitting, setIsDispatchSubmitting] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingNumberInput, setTrackingNumberInput] = useState('');
  const [trackingUrlInput, setTrackingUrlInput] = useState('');
  const [isTrackingSubmitting, setIsTrackingSubmitting] = useState(false);
  const [markDeliveredOrderId, setMarkDeliveredOrderId] = useState<string | null>(null);
  const [logisticsSearchTerm, setLogisticsSearchTerm] = useState('');

  const resetDispatchForm = () => {
    setDispatchOrderId(null);
    setDispatchCarrier('');
    setDispatchTrackingNumber('');
    setDispatchTrackingUrl('');
    setDispatchEstimatedDeliveryDate('');
    setDispatchNotes('');
    setIsDispatchSubmitting(false);
  };

  const openDispatchForm = (order: Order) => {
    setDispatchOrderId(order.id);
    setDispatchCarrier(order.shipment?.carrier || '');
    setDispatchTrackingNumber(order.shipment?.trackingNumber || '');
    setDispatchTrackingUrl(order.shipment?.trackingUrl || '');
    setDispatchEstimatedDeliveryDate(
      order.shipment?.estimatedDeliveryDate
        ? String(order.shipment.estimatedDeliveryDate).split('T')[0]
        : ''
    );
    setDispatchNotes(order.shipment?.notes || '');
  };

  const handleCreateShipment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dispatchOrderId) return;

    const carrier = dispatchCarrier.trim();
    const trackingNumber = dispatchTrackingNumber.trim();

    if (!carrier || !trackingNumber) {
      toast.error(t('admin.logistics.dispatchMissingFields', 'Carrier and tracking number are required'));
      return;
    }

    const shipment: ShipmentDetails = {
      carrier,
      trackingNumber,
      trackingUrl: dispatchTrackingUrl.trim() || undefined,
      estimatedDeliveryDate: dispatchEstimatedDeliveryDate || undefined,
      notes: dispatchNotes.trim() || undefined,
      shippedDate: new Date().toISOString(),
    };

    setIsDispatchSubmitting(true);
    try {
      await logisticsService.createShipment(dispatchOrderId, shipment);
      toast.success(t('admin.logistics.dispatchSuccess', 'Shipment created successfully'));
      await Promise.resolve(onRefreshOrders());
      resetDispatchForm();
    } catch (error) {
      logger.error('Failed to create shipment:', error);
      toast.error(t('admin.logistics.dispatchError', 'Failed to create shipment'));
    } finally {
      setIsDispatchSubmitting(false);
    }
  };

  const resetTrackingForm = () => {
    setTrackingOrderId(null);
    setTrackingNumberInput('');
    setTrackingUrlInput('');
    setIsTrackingSubmitting(false);
  };

  const openTrackingForm = (order: Order) => {
    setTrackingOrderId(order.id);
    setTrackingNumberInput(order.shipment?.trackingNumber || '');
    setTrackingUrlInput(order.shipment?.trackingUrl || '');
  };

  const handleUpdateTracking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trackingOrderId) return;

    const trackingNumber = trackingNumberInput.trim();
    if (!trackingNumber) {
      toast.error(t('admin.logistics.trackingRequired', 'Tracking number is required'));
      return;
    }

    setIsTrackingSubmitting(true);
    try {
      await logisticsService.updateTracking(
        trackingOrderId,
        trackingNumber,
        trackingUrlInput.trim() || undefined
      );
      toast.success(t('admin.logistics.trackingSuccess', 'Tracking details updated'));
      await Promise.resolve(onRefreshOrders());
      resetTrackingForm();
    } catch (error) {
      logger.error('Failed to update tracking:', error);
      toast.error(t('admin.logistics.trackingError', 'Failed to update tracking details'));
    } finally {
      setIsTrackingSubmitting(false);
    }
  };

  const handleMarkAsDelivered = async (orderId: string) => {
    setMarkDeliveredOrderId(orderId);
    try {
      await logisticsService.markAsDelivered(orderId);
      toast.success(t('admin.logistics.markDeliveredSuccess', 'Order marked as delivered'));
      await Promise.resolve(onRefreshOrders());
      if (trackingOrderId === orderId) {
        resetTrackingForm();
      }
    } catch (error) {
      logger.error('Failed to mark order as delivered:', error);
      toast.error(t('admin.logistics.markDeliveredError', 'Failed to update delivery status'));
    } finally {
      setMarkDeliveredOrderId(null);
    }
  };

  const logisticsQuery = logisticsSearchTerm.trim().toLowerCase();

  const clientsById = useMemo(
    () =>
      new Map(
        users
          .filter((user) => user.role === UserRole.CLIENT)
          .map((user) => [user.id, user.companyName || user.name || t('admin.logistics.unknownDestination', 'Unknown destination')])
      ),
    [t, users]
  );

  const suppliersById = useMemo(
    () =>
      new Map(
        users
          .filter((user) => user.role === UserRole.SUPPLIER)
          .map((user) => [user.id, user.companyName || user.name || t('admin.logistics.unknownSupplier', 'Unknown supplier')])
      ),
    [t, users]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!logisticsQuery) return true;
        const supplierName = suppliersById.get(order.supplierId) || '';
        const destinationName = clientsById.get(order.clientId) || '';
        const trackingNumber = order.shipment?.trackingNumber || '';
        const haystack = `${order.id} ${supplierName} ${destinationName} ${trackingNumber}`.toLowerCase();
        return haystack.includes(logisticsQuery);
      }),
    [clientsById, logisticsQuery, orders, suppliersById]
  );

  const dispatchQueueOrders = filteredOrders.filter((order) => {
    const hasShipment = Boolean(order.shipment?.trackingNumber || order.shipment?.carrier);
    if (hasShipment) return false;
    return [
      OrderStatus.PAYMENT_CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.PICKUP_SCHEDULED,
    ].includes(order.status as OrderStatus);
  });

  const shipmentOrders = filteredOrders
    .filter((order) => {
      const hasShipment = Boolean(order.shipment?.trackingNumber || order.shipment?.carrier);
      return hasShipment || [
        OrderStatus.SHIPPED,
        OrderStatus.IN_TRANSIT,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
      ].includes(order.status as OrderStatus);
    })
    .sort((a, b) => {
      const aDate = parseDate(a.updatedAt || a.createdAt || a.date);
      const bDate = parseDate(b.updatedAt || b.createdAt || b.date);
      return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
    });

  const activeShipmentCount = shipmentOrders.filter((order) => order.status !== OrderStatus.DELIVERED).length;
  const deliveredTodayCount = shipmentOrders.filter((order) => {
    if (order.status !== OrderStatus.DELIVERED) return false;
    const deliveredAt = parseDate(order.updatedAt || order.date);
    if (!deliveredAt) return false;
    const now = new Date();
    return deliveredAt.toDateString() === now.toDateString();
  }).length;

  const selectedDispatchOrder = dispatchOrderId ? orders.find((order) => order.id === dispatchOrderId) || null : null;
  const selectedTrackingOrder = trackingOrderId ? orders.find((order) => order.id === trackingOrderId) || null : null;

  return (
    <div className="space-y-8 p-4 md:p-8 lg:p-12">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">{t('admin.logistics.activeShipments')}</h3>
          <p className="text-4xl font-bold text-slate-900">{activeShipmentCount}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">{t('admin.logistics.deliveredToday', 'Delivered Today')}</h3>
          <p className="text-4xl font-bold text-slate-900">{deliveredTodayCount}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">{t('admin.logistics.pendingDispatch')}</h3>
          <p className="text-4xl font-bold text-slate-900">{dispatchQueueOrders.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input
              value={logisticsSearchTerm}
              onChange={(event) => setLogisticsSearchTerm(event.target.value)}
              placeholder={t('admin.logistics.searchPlaceholder', 'Search order, supplier, destination or tracking...')}
              className="w-full rounded-xl border border-slate-300 pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
          <button
            onClick={() => Promise.resolve(onRefreshOrders())}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            {t('common.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600">inventory_2</span>
            {t('admin.logistics.dispatchQueue', 'Dispatch Queue')}
          </h3>
          <p className="text-sm text-slate-500 mt-1">{t('admin.logistics.dispatchQueueHint', 'Orders ready to be dispatched')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.orderId', 'Order')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.supplier')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.destination')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.status')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.orders.amount', 'Amount')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">{t('admin.logistics.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dispatchQueueOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">{t('admin.logistics.noDispatchQueue', 'No orders pending dispatch')}</td>
                </tr>
              ) : (
                dispatchQueueOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-900">{order.id}</td>
                    <td className="p-4 text-sm text-slate-700">{suppliersById.get(order.supplierId) || t('admin.logistics.unknownSupplier', 'Unknown supplier')}</td>
                    <td className="p-4 text-sm text-slate-700">{clientsById.get(order.clientId) || t('admin.logistics.unknownDestination', 'Unknown destination')}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClasses[order.status] || 'bg-slate-100 text-slate-700'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-semibold text-slate-800">${order.amount.toLocaleString()}</td>
                    <td className="p-4">
                      <div className="flex justify-end">
                        <button
                          onClick={() => openDispatchForm(order)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">local_shipping</span>
                          {t('admin.logistics.dispatchOrder', 'Dispatch')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDispatchOrder && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('admin.logistics.dispatchFormTitle', 'Create Shipment')} #{selectedDispatchOrder.id}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {t('admin.logistics.dispatchFormHint', 'Provide carrier and tracking details to dispatch this order')}
              </p>
            </div>
            <button
              onClick={resetDispatchForm}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              aria-label={t('common.close', 'Close')}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <form onSubmit={handleCreateShipment} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.carrier', 'Carrier')}</span>
              <input
                value={dispatchCarrier}
                onChange={(event) => setDispatchCarrier(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                placeholder={t('admin.logistics.carrierPlaceholder', 'e.g. Aramex')}
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingNumber', 'Tracking Number')}</span>
              <input
                value={dispatchTrackingNumber}
                onChange={(event) => setDispatchTrackingNumber(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                placeholder={t('admin.logistics.trackingNumberPlaceholder', 'Enter tracking number')}
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingUrl', 'Tracking URL')}</span>
              <input
                value={dispatchTrackingUrl}
                onChange={(event) => setDispatchTrackingUrl(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                placeholder="https://"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.eta', 'ETA')}</span>
              <input
                type="date"
                value={dispatchEstimatedDeliveryDate}
                onChange={(event) => setDispatchEstimatedDeliveryDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.notes', 'Notes')}</span>
              <textarea
                value={dispatchNotes}
                onChange={(event) => setDispatchNotes(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 min-h-[96px]"
                placeholder={t('admin.logistics.notesPlaceholder', 'Optional dispatch notes')}
              />
            </label>
            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetDispatchForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={isDispatchSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDispatchSubmitting && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                {t('admin.logistics.createShipment', 'Create Shipment')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600">local_shipping</span>
            {t('admin.logistics.liveTracking')}
          </h3>
          <button
            onClick={() => window.open('https://www.google.com/maps/search/logistics+tracking', '_blank', 'noopener,noreferrer')}
            className="text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            {t('admin.logistics.viewMap')}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.shipmentId')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.orderId', 'Order ID')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.supplier')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.destination')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.status')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.eta')}</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipmentOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">{t('admin.logistics.noShipments')}</td>
                </tr>
              ) : (
                shipmentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-900">
                      {order.shipment?.trackingNumber || `TRK-${order.id.slice(-8).toUpperCase()}`}
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-700">{order.id}</td>
                    <td className="p-4 text-sm font-bold text-slate-700">{suppliersById.get(order.supplierId) || t('admin.logistics.unknownSupplier', 'Unknown supplier')}</td>
                    <td className="p-4 text-sm text-slate-500">{clientsById.get(order.clientId) || t('admin.logistics.unknownDestination', 'Unknown destination')}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClasses[order.status] || 'bg-slate-100 text-slate-700'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-bold text-slate-700">
                      {order.shipment?.estimatedDeliveryDate
                        ? new Date(order.shipment.estimatedDeliveryDate).toLocaleDateString()
                        : 'TBD'}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openTrackingForm(order)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                          {t('admin.logistics.updateTracking', 'Update Tracking')}
                        </button>
                        {order.status !== OrderStatus.DELIVERED && (
                          <button
                            onClick={() => handleMarkAsDelivered(order.id)}
                            disabled={markDeliveredOrderId === order.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {markDeliveredOrderId === order.id && (
                              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                            )}
                            {t('admin.logistics.markDelivered', 'Mark Delivered')}
                          </button>
                        )}
                        {order.shipment?.trackingUrl && (
                          <a
                            href={order.shipment.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            {t('admin.logistics.track', 'Track')}
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTrackingOrder && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('admin.logistics.editTrackingTitle', 'Update Tracking')} #{selectedTrackingOrder.id}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {t('admin.logistics.editTrackingHint', 'Update tracking info shown to the client and supplier')}
              </p>
            </div>
            <button
              onClick={resetTrackingForm}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              aria-label={t('common.close', 'Close')}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <form onSubmit={handleUpdateTracking} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingNumber', 'Tracking Number')}</span>
              <input
                value={trackingNumberInput}
                onChange={(event) => setTrackingNumberInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                placeholder={t('admin.logistics.trackingNumberPlaceholder', 'Enter tracking number')}
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingUrl', 'Tracking URL')}</span>
              <input
                value={trackingUrlInput}
                onChange={(event) => setTrackingUrlInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                placeholder="https://"
              />
            </label>
            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetTrackingForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={isTrackingSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isTrackingSubmitting && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                {t('admin.logistics.saveTracking', 'Save Tracking')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
