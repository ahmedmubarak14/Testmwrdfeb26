import React from 'react';
import { useTranslation } from 'react-i18next';
import { SearchBar } from '../../ui/SearchBar';
import type { DashboardStats } from '../../../services/dashboardService';

interface PendingAction {
  type: string;
  desc: string;
  tab: string;
}

interface RecentOrderRow {
  id: string;
  client: string;
  status: string;
  value: string;
  date: string;
}

interface AdminOverviewViewProps {
  overviewRangeDays: number;
  onSetOverviewLast30Days: () => void;
  onSetOverviewCustomRange: () => void;
  onOpenAdminNotifications: () => void;
  onOverviewAction: (tab: string) => void;
  onExportOrdersCsv: () => void;
  dashboardStats: DashboardStats | null;
  currentTotalSales: number;
  currentAverageMargin: number;
  currentTotalOrders: number;
  salesDelta: number;
  marginDelta: number;
  ordersDelta: number;
  moneyFormatter: Intl.NumberFormat;
  integerFormatter: Intl.NumberFormat;
  trendClassName: (value: number) => string;
  trendIcon: (value: number) => string;
  formatDelta: (value: number) => string;
  salesChartRef: React.RefObject<HTMLCanvasElement | null>;
  marginChartRef: React.RefObject<HTMLCanvasElement | null>;
  ordersChartRef: React.RefObject<HTMLCanvasElement | null>;
  revenueChartRef: React.RefObject<HTMLCanvasElement | null>;
  visiblePendingActions: PendingAction[];
  recentOrders: RecentOrderRow[];
  orderStatusBadgeClasses: Record<string, string>;
  renderAdminOverlay: () => React.ReactNode;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({
  overviewRangeDays,
  onSetOverviewLast30Days,
  onSetOverviewCustomRange,
  onOpenAdminNotifications,
  onOverviewAction,
  onExportOrdersCsv,
  dashboardStats,
  currentTotalSales,
  currentAverageMargin,
  currentTotalOrders,
  salesDelta,
  marginDelta,
  ordersDelta,
  moneyFormatter,
  integerFormatter,
  trendClassName,
  trendIcon,
  formatDelta,
  salesChartRef,
  marginChartRef,
  ordersChartRef,
  revenueChartRef,
  visiblePendingActions,
  recentOrders,
  orderStatusBadgeClasses,
  renderAdminOverlay,
}) => {
  const { t } = useTranslation();

  return (
    <div data-testid="admin-overview-view" className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark font-display">
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-neutral-200 dark:border-neutral-600/50 bg-white dark:bg-neutral-800 px-4 sm:px-6 md:px-8 py-3 sticky top-0 z-10">
        <div className="flex flex-1 items-center gap-8">
          <div className="max-w-md w-full">
            <SearchBar
              placeholder={t('admin.overview.searchPlaceholder')}
              size="md"
            />
          </div>
        </div>
        <div className="flex flex-initial justify-end gap-4 items-center">
          <button
            onClick={onOpenAdminNotifications}
            className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 w-10 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-600/30 text-neutral-800 dark:text-white transition-colors"
          >
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <div
            className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10"
            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBZdY1np0K0nYpFYxH6huL8l275ppgN8ImHZQIKoc_Q-Gdt8dvGPDTQXs8Sk1_ZeFL04mGg4gzpQP7w3FJGacZ5qaLtQTIw-n4NXot4cb2mner5tdkhl8wHkrR9IpwPWfQL3jRJU3ecz7UwaKbIYbClwI7Q9mG-jNP_Pfj6fPNqIVANhovGgiIDHnnQipZagPuBsEzWwwiBqYaaiyNYMQZpf_Vs3qKXz8AQIhJCYWX5mGuarxkURrH08bJmV1408KQzNVE40LzqWDdX")' }}
          ></div>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-8 lg:p-12">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <p className="text-neutral-800 dark:text-white text-2xl sm:text-3xl font-bold leading-tight tracking-tight min-w-0 sm:min-w-72">{t('admin.overview.title')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={onSetOverviewLast30Days}
                className="flex h-10 sm:h-9 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-white dark:bg-neutral-800 dark:border dark:border-neutral-600/50 px-3 shadow-sm hover:bg-neutral-50"
              >
                <p className="text-neutral-800 dark:text-white text-sm font-medium leading-normal">
                  {overviewRangeDays === 30
                    ? (t('admin.overview.last30Days') || 'Last 30 Days')
                    : `${overviewRangeDays} ${t('common.days') || 'days'}`}
                </p>
                <span className="material-symbols-outlined text-neutral-800 dark:text-white text-base">expand_more</span>
              </button>
              <button
                onClick={onSetOverviewCustomRange}
                className="flex h-10 sm:h-9 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-white dark:bg-neutral-800 dark:border dark:border-neutral-600/50 px-3 shadow-sm hover:bg-neutral-50"
              >
                <p className="text-neutral-800 dark:text-white text-sm font-medium leading-normal">{t('admin.overview.customRange')}</p>
                <span className="material-symbols-outlined text-neutral-800 dark:text-white text-base">expand_more</span>
              </button>
              <button
                onClick={onExportOrdersCsv}
                className="flex h-10 sm:h-9 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 px-3 shadow-sm transition-colors border border-green-200"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <p className="text-sm font-bold leading-normal">Export CSV</p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              data-testid="admin-overview-quick-users"
              onClick={() => onOverviewAction('users')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-primary hover:text-primary dark:border-neutral-600/50 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {t('sidebar.users') || 'Users'}
            </button>
            <button
              data-testid="admin-overview-quick-approvals"
              onClick={() => onOverviewAction('approvals')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-primary hover:text-primary dark:border-neutral-600/50 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {t('sidebar.approvals') || 'Approvals'}
            </button>
            <button
              data-testid="admin-overview-quick-margins"
              onClick={() => onOverviewAction('margins')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-primary hover:text-primary dark:border-neutral-600/50 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {t('sidebar.margins') || 'Margins'}
            </button>
            <button
              data-testid="admin-overview-quick-orders"
              onClick={() => onOverviewAction('orders')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-primary hover:text-primary dark:border-neutral-600/50 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {t('sidebar.orders') || 'Orders'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex flex-col gap-2">
                <p className="text-neutral-600 dark:text-neutral-200 text-sm font-medium leading-normal">{t('admin.overview.totalSales')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-neutral-800 dark:text-white tracking-tight text-3xl font-bold leading-tight">
                    {dashboardStats ? moneyFormatter.format(dashboardStats.totalSales) : moneyFormatter.format(currentTotalSales)}
                  </p>
                  {!dashboardStats && (
                    <p className={`${trendClassName(salesDelta)} text-sm font-medium leading-normal flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-base">{trendIcon(salesDelta)}</span>
                      <span>{formatDelta(salesDelta)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="h-24 -mx-6 -mb-6"><canvas ref={salesChartRef}></canvas></div>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex flex-col gap-2">
                <p className="text-neutral-600 dark:text-neutral-200 text-sm font-medium leading-normal">{t('admin.overview.averageMargin')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-neutral-800 dark:text-white tracking-tight text-3xl font-bold leading-tight">
                    {dashboardStats ? dashboardStats.averageMargin.toFixed(1) : currentAverageMargin.toFixed(1)}%
                  </p>
                  {!dashboardStats && (
                    <p className={`${trendClassName(marginDelta)} text-sm font-medium leading-normal flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-base">{trendIcon(marginDelta)}</span>
                      <span>{formatDelta(marginDelta)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="h-24 -mx-6 -mb-6"><canvas ref={marginChartRef}></canvas></div>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex flex-col gap-2">
                <p className="text-neutral-600 dark:text-neutral-200 text-sm font-medium leading-normal">{t('admin.overview.totalOrders')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-neutral-800 dark:text-white tracking-tight text-3xl font-bold leading-tight">
                    {dashboardStats ? integerFormatter.format(dashboardStats.totalOrders) : integerFormatter.format(currentTotalOrders)}
                  </p>
                  {!dashboardStats && (
                    <p className={`${trendClassName(ordersDelta)} text-sm font-medium leading-normal flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-base">{trendIcon(ordersDelta)}</span>
                      <span>{formatDelta(ordersDelta)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="h-24 -mx-6 -mb-6"><canvas ref={ordersChartRef}></canvas></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex justify-between items-center">
                <h3 className="text-neutral-800 dark:text-white text-lg font-bold">{t('admin.overview.revenueBreakdown')}</h3>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-chart-blue"></div>
                    <span className="text-neutral-600 dark:text-neutral-200">{t('admin.overview.sales')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-chart-green"></div>
                    <span className="text-neutral-600 dark:text-neutral-200">{t('admin.overview.margin')}</span>
                  </div>
                </div>
              </div>
              <div className="h-80"><canvas ref={revenueChartRef}></canvas></div>
            </div>

            <div className="flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <h3 className="text-neutral-800 dark:text-white text-lg font-bold">{t('admin.overview.pendingActions')}</h3>
              <div className="flex flex-col gap-2">
                {visiblePendingActions.map((action, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-lg hover:bg-neutral-100/50 dark:hover:bg-neutral-600/20 transition-colors">
                    <div className="flex flex-col">
                      <p className="text-xs text-neutral-600 dark:text-neutral-200">{action.type}</p>
                      <p className="text-sm font-medium text-neutral-800 dark:text-white">{action.desc}</p>
                    </div>
                    <button
                      data-testid={`admin-overview-pending-action-${i}`}
                      onClick={() => onOverviewAction(action.tab)}
                      className="text-primary text-sm font-bold hover:underline"
                    >
                      {t('admin.overview.view')}
                    </button>
                  </div>
                ))}
                {visiblePendingActions.length === 0 && (
                  <div className="p-3 text-sm text-neutral-500 dark:text-neutral-200">
                    {t('admin.approvals.allCaughtUp') || 'All caught up'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50 overflow-hidden">
            <h3 className="text-neutral-800 dark:text-white text-lg font-bold p-6 pb-2">{t('admin.overview.recentOrders')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-600 dark:text-neutral-200 uppercase bg-neutral-100/50 dark:bg-neutral-600/20">
                  <tr>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.orderId')}</th>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.client')}</th>
                    <th className="px-6 py-3" scope="col">{t('common.status')}</th>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.value')}</th>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.date')}</th>
                  </tr>
                </thead>
                <tbody className="text-neutral-800 dark:text-white">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0 dark:border-neutral-600/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                      <td className="px-6 py-4 font-medium">{order.id}</td>
                      <td className="px-6 py-4">{order.client}</td>
                      <td className="px-6 py-4">
                        <span className={`${orderStatusBadgeClasses[order.status] || 'bg-slate-100 dark:bg-slate-900/40 text-slate-800 dark:text-slate-300'} text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full`}>
                          {t(`status.${order.status.toLowerCase()}`, order.status.replace(/_/g, ' '))}
                        </span>
                      </td>
                      <td className="px-6 py-4">{order.value}</td>
                      <td className="px-6 py-4 text-neutral-600 dark:text-neutral-200">{order.date}</td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-neutral-500 dark:text-neutral-200">
                        {t('admin.overview.noOrders', 'No orders found')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {renderAdminOverlay()}
    </div>
  );
};
