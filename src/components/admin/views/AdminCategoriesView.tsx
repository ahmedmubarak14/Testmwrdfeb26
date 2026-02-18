import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../../hooks/useToast';
import {
  AdminCategoryNode,
  AdminSubcategoryNode,
  categoryManagementService,
} from '../../../services/categoryManagementService';
import { PortalPageHeader, PortalPageShell, PortalSection } from '../../ui/PortalDashboardShell';
import { logger } from '../../../utils/logger';

interface CategoryDraft {
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

interface SubcategoryDraft {
  parentId: string;
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

interface DeleteTarget {
  id: string;
  name: string;
  type: 'category' | 'subcategory';
  parentId?: string;
}

const toSafeOrder = (value: string, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const AdminCategoriesView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [categories, setCategories] = useState<AdminCategoryNode[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');

  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isAddSubcategoryModalOpen, setIsAddSubcategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AdminCategoryNode | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<{ parentId: string; subcategory: AdminSubcategoryNode } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [newCategory, setNewCategory] = useState<CategoryDraft>({
    name: '',
    icon: 'folder',
    sortOrder: 1,
    isActive: true,
  });
  const [newSubcategory, setNewSubcategory] = useState<SubcategoryDraft>({
    parentId: '',
    name: '',
    icon: 'label',
    sortOrder: 1,
    isActive: true,
  });

  const loadCategories = useCallback(async (seedDefaults = true, showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const tree = await categoryManagementService.getTree({ seedDefaults });
      setCategories(tree);
      setLoadError(null);
      return tree;
    } catch (error: any) {
      logger.error('Failed to load admin categories:', error);
      setLoadError(error?.message || t('admin.categories.loadError'));
      return [];
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadCategories(true, true);
  }, [loadCategories]);

  useEffect(() => {
    setExpandedCategories((previous) => {
      if (categories.length === 0) return new Set();
      if (previous.size === 0) {
        return new Set(categories.map((category) => category.id));
      }
      const next = new Set<string>();
      categories.forEach((category) => {
        if (previous.has(category.id)) {
          next.add(category.id);
        }
      });
      return next;
    });
  }, [categories]);

  const totalSubcategories = useMemo(
    () => categories.reduce((sum, category) => sum + category.subcategories.length, 0),
    [categories]
  );

  const visibleCategories = useMemo(() => {
    const term = categorySearchTerm.trim().toLowerCase();
    if (!term) return categories;

    return categories
      .map((category) => {
        const categoryMatches = category.name.toLowerCase().includes(term);
        if (categoryMatches) return category;

        const matchingSubcategories = category.subcategories.filter((subcategory) =>
          subcategory.name.toLowerCase().includes(term)
        );
        if (matchingSubcategories.length === 0) return null;

        return {
          ...category,
          subcategories: matchingSubcategories,
        };
      })
      .filter((category): category is AdminCategoryNode => Boolean(category));
  }, [categories, categorySearchTerm]);

  const visibleSubcategoriesCount = useMemo(
    () => visibleCategories.reduce((sum, category) => sum + category.subcategories.length, 0),
    [visibleCategories]
  );
  const isSearchActive = categorySearchTerm.trim().length > 0;

  const normalizeTaxonomyKey = (value: string) =>
    String(value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '')
      .trim();

  const toCamelCase = (value: string) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase());

  const translateTaxonomyLabel = (label: string, candidateKeys: string[]) => {
    for (const key of candidateKeys) {
      if (key && i18n.exists(key)) {
        return t(key);
      }
    }
    return label;
  };

  const getCategoryLabel = (categoryName: string) => {
    const keyMap: Record<string, string> = {
      Office: 'office',
      'IT Supplies': 'itSupplies',
      Breakroom: 'breakroom',
      Janitorial: 'janitorial',
      Maintenance: 'maintenance',
      General: 'general',
    };

    const normalized = normalizeTaxonomyKey(categoryName);
    const mapped = keyMap[categoryName] || normalized;

    return translateTaxonomyLabel(categoryName, [
      `categories.${mapped}.label`,
      `categories.sub.${mapped}`,
      `subcategories.office.${toCamelCase(categoryName)}`,
      `subcategories.it.${toCamelCase(categoryName)}`,
      `subcategories.breakroom.${toCamelCase(categoryName)}`,
      `subcategories.janitorial.${toCamelCase(categoryName)}`,
      `subcategories.maintenance.${toCamelCase(categoryName)}`,
    ]);
  };

  const getSubcategoryLabel = (subcategoryName: string, parentCategoryName: string) => {
    const normalizedSub = normalizeTaxonomyKey(subcategoryName);
    const camelSub = toCamelCase(subcategoryName);
    const normalizedParent = normalizeTaxonomyKey(parentCategoryName);
    const keyMap: Record<string, string> = {
      tools: 'tools',
      electrical: 'electrical',
      plumbing: 'plumbing',
      hardware: 'hardware',
      safetyequipment: 'safetyEquipment',
      janitorial: 'janitorial',
    };
    const mappedSub = keyMap[normalizedSub] || normalizedSub;

    return translateTaxonomyLabel(subcategoryName, [
      `categories.${normalizedParent}.subcategories.${mappedSub}.label`,
      `categories.sub.${mappedSub}`,
      `subcategories.office.${camelSub}`,
      `subcategories.it.${camelSub}`,
      `subcategories.breakroom.${camelSub}`,
      `subcategories.janitorial.${camelSub}`,
      `subcategories.maintenance.${camelSub}`,
    ]);
  };

  const resetCategoryDraft = useCallback(() => {
    setNewCategory({
      name: '',
      icon: 'folder',
      sortOrder: categories.length + 1,
      isActive: true,
    });
  }, [categories.length]);

  const resetSubcategoryDraft = useCallback((parentId = '') => {
    const parent = categories.find((category) => category.id === parentId);
    setNewSubcategory({
      parentId,
      name: '',
      icon: 'label',
      sortOrder: (parent?.subcategories.length || 0) + 1,
      isActive: true,
    });
  }, [categories]);

  const runMutation = useCallback(async (
    action: () => Promise<void>,
    successMessage: string,
    fallbackError: string
  ) => {
    setIsMutating(true);
    try {
      await action();
      await loadCategories(false, false);
      toast.success(successMessage);
    } catch (error: any) {
      logger.error('Category mutation failed:', error);
      toast.error(error?.message || fallbackError);
    } finally {
      setIsMutating(false);
    }
  }, [loadCategories, toast]);

  const toggleExpand = (id: string) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedCategories(new Set(visibleCategories.map((category) => category.id)));
  };

  const handleCollapseAll = () => {
    setExpandedCategories(new Set());
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) return;

    await runMutation(
      async () => {
        await categoryManagementService.createCategory({
          name: newCategory.name,
          icon: newCategory.icon || 'folder',
          sortOrder: toSafeOrder(String(newCategory.sortOrder), categories.length + 1),
          isActive: newCategory.isActive,
          parentId: null,
        });
      },
      t('admin.categories.created'),
      t('admin.categories.createFailed')
    );

    resetCategoryDraft();
    setIsAddCategoryModalOpen(false);
  };

  const handleCreateSubcategory = async () => {
    if (!newSubcategory.parentId || !newSubcategory.name.trim()) return;

    const parent = categories.find((category) => category.id === newSubcategory.parentId);

    await runMutation(
      async () => {
        await categoryManagementService.createCategory({
          name: newSubcategory.name,
          icon: newSubcategory.icon || 'label',
          sortOrder: toSafeOrder(String(newSubcategory.sortOrder), (parent?.subcategories.length || 0) + 1),
          isActive: newSubcategory.isActive,
          parentId: newSubcategory.parentId,
        });
      },
      t('admin.categories.subcategoryCreated'),
      t('admin.categories.subcategoryCreateFailed')
    );

    resetSubcategoryDraft();
    setIsAddSubcategoryModalOpen(false);
  };

  const handleSaveCategory = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;

    await runMutation(
      async () => {
        await categoryManagementService.updateCategory(editingCategory.id, {
          name: editingCategory.name,
          icon: editingCategory.icon,
          sortOrder: toSafeOrder(String(editingCategory.sortOrder), 1),
          isActive: editingCategory.isActive,
        });
      },
      t('admin.categories.updated'),
      t('admin.categories.updateFailed')
    );

    setEditingCategory(null);
  };

  const handleSaveSubcategory = async () => {
    if (!editingSubcategory || !editingSubcategory.subcategory.name.trim()) return;

    await runMutation(
      async () => {
        await categoryManagementService.updateCategory(editingSubcategory.subcategory.id, {
          name: editingSubcategory.subcategory.name,
          icon: editingSubcategory.subcategory.icon,
          sortOrder: toSafeOrder(String(editingSubcategory.subcategory.sortOrder), 1),
          isActive: editingSubcategory.subcategory.isActive,
          parentId: editingSubcategory.parentId,
        });
      },
      t('admin.categories.subcategoryUpdated'),
      t('admin.categories.subcategoryUpdateFailed')
    );

    setEditingSubcategory(null);
  };

  const handleToggleCategory = async (category: AdminCategoryNode) => {
    await runMutation(
      async () => {
        await categoryManagementService.updateCategory(category.id, {
          isActive: !category.isActive,
        });
      },
      t('admin.categories.statusUpdated'),
      t('admin.categories.statusUpdateFailed')
    );
  };

  const handleToggleSubcategory = async (subcategory: AdminSubcategoryNode) => {
    await runMutation(
      async () => {
        await categoryManagementService.updateCategory(subcategory.id, {
          isActive: !subcategory.isActive,
        });
      },
      t('admin.categories.statusUpdated'),
      t('admin.categories.statusUpdateFailed')
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    await runMutation(
      async () => {
        if (deleteTarget.type === 'category') {
          await categoryManagementService.deleteCategoryWithChildren(deleteTarget.id);
        } else {
          await categoryManagementService.deleteCategory(deleteTarget.id);
        }
      },
      t('admin.categories.deleted'),
      t('admin.categories.deleteFailed')
    );

    setDeleteTarget(null);
  };

  const handleMoveCategory = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const next = [...categories];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    const normalized = next.map((category, idx) => ({
      ...category,
      sortOrder: idx + 1,
    }));

    setCategories(normalized);

    await runMutation(
      async () => {
        await categoryManagementService.updateSortOrders(
          normalized.map((category) => ({ id: category.id, sortOrder: category.sortOrder }))
        );
      },
      t('admin.categories.orderUpdated'),
      t('admin.categories.orderUpdateFailed')
    );
  };

  const handleMoveSubcategory = async (parentId: string, subIndex: number, direction: -1 | 1) => {
    const parent = categories.find((category) => category.id === parentId);
    if (!parent) return;

    const targetIndex = subIndex + direction;
    if (targetIndex < 0 || targetIndex >= parent.subcategories.length) return;

    const reorderedSubs = [...parent.subcategories];
    [reorderedSubs[subIndex], reorderedSubs[targetIndex]] = [reorderedSubs[targetIndex], reorderedSubs[subIndex]];
    const normalizedSubs = reorderedSubs.map((subcategory, idx) => ({
      ...subcategory,
      sortOrder: idx + 1,
    }));

    setCategories((previous) => previous.map((category) => (
      category.id === parentId
        ? { ...category, subcategories: normalizedSubs }
        : category
    )));

    await runMutation(
      async () => {
        await categoryManagementService.updateSortOrders(
          normalizedSubs.map((subcategory) => ({ id: subcategory.id, sortOrder: subcategory.sortOrder }))
        );
      },
      t('admin.categories.orderUpdated'),
      t('admin.categories.orderUpdateFailed')
    );
  };

  const openCreateSubcategoryModal = (parentId: string) => {
    resetSubcategoryDraft(parentId);
    setIsAddSubcategoryModalOpen(true);
  };

  const renderLoadingState = () => (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-12 text-center">
      <span className="material-symbols-outlined text-4xl text-slate-400 animate-spin">progress_activity</span>
      <p className="mt-3 text-sm text-slate-500">{t('common.loading')}</p>
    </div>
  );

  return (
    <div className="bg-gray-50 animate-in fade-in duration-300">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('admin.categories.title')}
          subtitle={t('admin.categories.subtitle')}
          actions={(
            <>
              <button
                onClick={() => { void loadCategories(false, true); }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                aria-label={t('common.refresh')}
                disabled={isMutating}
              >
                {t('common.refresh')}
              </button>
              <button
                onClick={() => {
                  resetCategoryDraft();
                  setIsAddCategoryModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] hover:bg-[#0f6fd0] text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                aria-label={t('admin.categories.addCategory')}
                disabled={isMutating}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {t('admin.categories.addCategory')}
              </button>
            </>
          )}
        />

        <PortalSection bodyClassName="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-2 top-2.5 text-base text-slate-400">
                search
              </span>
              <input
                type="text"
                value={categorySearchTerm}
                onChange={(event) => setCategorySearchTerm(event.target.value)}
                placeholder={t('admin.categories.searchPlaceholder')}
                aria-label={t('admin.categories.searchPlaceholder')}
                className="w-full rounded-lg border border-slate-300 px-8 py-2 text-sm text-slate-900 outline-none focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/15"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExpandAll}
                className="px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                disabled={isMutating || visibleCategories.length === 0}
              >
                {t('admin.categories.expandAll')}
              </button>
              <button
                onClick={handleCollapseAll}
                className="px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                disabled={isMutating || expandedCategories.size === 0}
              >
                {t('admin.categories.collapseAll')}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {t('admin.categories.showingCounts', {
              categories: visibleCategories.length,
              totalCategories: categories.length,
              subcategories: visibleSubcategoriesCount,
              defaultValue: 'Showing {{categories}} of {{totalCategories}} categories and {{subcategories}} subcategories',
            })}
          </p>
          {isSearchActive && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t('admin.categories.reorderDisabledWhileFiltering')}
            </p>
          )}
        </PortalSection>

        <div className="space-y-6">
        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        {isLoading ? renderLoadingState() : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard icon="category" label={t('admin.categories.totalCategories')} value={categories.length} color="blue" />
              <SummaryCard icon="account_tree" label={t('admin.categories.totalSubcategories')} value={totalSubcategories} color="green" />
              <SummaryCard icon="check_circle" label={t('admin.categories.activeCategories')} value={categories.filter((category) => category.isActive).length} color="emerald" />
              <SummaryCard icon="pause_circle" label={t('admin.categories.inactiveCategories')} value={categories.filter((category) => !category.isActive).length} color="amber" />
            </div>

            {categories.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">folder_off</span>
                <p className="text-sm text-slate-500">{t('admin.categories.noCategories')}</p>
                <button
                  onClick={() => {
                    void runMutation(
                      async () => {
                        await categoryManagementService.seedDefaults();
                      },
                      t('admin.categories.seededDefaults'),
                      t('admin.categories.seedFailed')
                    );
                  }}
                  className="mt-3 px-4 py-2 rounded-md bg-[#137fec] text-white text-sm font-semibold hover:bg-[#137fec]/90"
                >
                  {t('admin.categories.restoreDefaults')}
                </button>
              </div>
            ) : visibleCategories.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">search_off</span>
                <p className="text-sm text-slate-500">{t('admin.categories.noSearchResults')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleCategories.map((category) => {
                  const isExpanded = expandedCategories.has(category.id);
                  const categoryIndexInFull = categories.findIndex((item) => item.id === category.id);

                  return (
                    <div key={category.id} className="bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 p-4">
                      <button
                        onClick={() => toggleExpand(category.id)}
                        className="p-1 rounded hover:bg-slate-100"
                        aria-label={isExpanded ? t('admin.categories.collapse') : t('admin.categories.expand')}
                      >
                        <span className="material-symbols-outlined text-lg text-slate-500" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          chevron_right
                        </span>
                      </button>

                      <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                        <span className="material-symbols-outlined">{category.icon || 'folder'}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 truncate">{getCategoryLabel(category.name)}</h3>
                          {!category.isActive && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              {t('common.inactive')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t('admin.categories.subcategoriesCount', { count: category.subcategories.length })}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { void handleMoveCategory(categoryIndexInFull, -1); }}
                          disabled={isMutating || isSearchActive || categoryIndexInFull <= 0}
                          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"
                          aria-label={t('admin.categories.moveUp')}
                        >
                          <span className="material-symbols-outlined text-base text-slate-600">arrow_upward</span>
                        </button>
                        <button
                          onClick={() => { void handleMoveCategory(categoryIndexInFull, 1); }}
                          disabled={isMutating || isSearchActive || categoryIndexInFull < 0 || categoryIndexInFull === categories.length - 1}
                          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"
                          aria-label={t('admin.categories.moveDown')}
                        >
                          <span className="material-symbols-outlined text-base text-slate-600">arrow_downward</span>
                        </button>
                        <button
                          onClick={() => { void handleToggleCategory(category); }}
                          disabled={isMutating}
                          className={`p-1.5 rounded ${category.isActive ? 'text-green-700 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                          aria-label={t('admin.categories.toggleActive')}
                        >
                          <span className="material-symbols-outlined text-base">{category.isActive ? 'toggle_on' : 'toggle_off'}</span>
                        </button>
                        <button
                          onClick={() => setEditingCategory({ ...category })}
                          disabled={isMutating}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                          aria-label={t('common.edit')}
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        <button
                          onClick={() => openCreateSubcategoryModal(category.id)}
                          disabled={isMutating}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-700"
                          aria-label={t('admin.categories.addSubcategory')}
                        >
                          <span className="material-symbols-outlined text-base">add_circle</span>
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: category.id, name: getCategoryLabel(category.name), type: 'category' })}
                          disabled={isMutating}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600"
                          aria-label={t('common.delete')}
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 pb-4">
                        {category.subcategories.length === 0 ? (
                          <div className="py-5 text-sm text-slate-500">{t('admin.categories.noSubcategories')}</div>
                        ) : (
                          <div className="space-y-2 pt-3">
                            {category.subcategories.map((subcategory, subIndex) => {
                              const parentCategory = categories.find((item) => item.id === category.id);
                              const parentSubcategories = parentCategory?.subcategories || [];
                              const actualSubIndex = parentSubcategories.findIndex((item) => item.id === subcategory.id);
                              const normalizedSubIndex = actualSubIndex >= 0 ? actualSubIndex : subIndex;
                              const isFirstSubcategory = normalizedSubIndex === 0;
                              const isLastSubcategory = normalizedSubIndex === parentSubcategories.length - 1;

                              return (
                              <div key={subcategory.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                                  <span className="material-symbols-outlined text-sm">{subcategory.icon || 'label'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{getSubcategoryLabel(subcategory.name, category.name)}</p>
                                </div>
                                {!subcategory.isActive && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
                                    {t('common.inactive')}
                                  </span>
                                )}
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => { void handleMoveSubcategory(category.id, normalizedSubIndex, -1); }}
                                    disabled={isMutating || isSearchActive || isFirstSubcategory}
                                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
                                    aria-label={t('admin.categories.moveUp')}
                                  >
                                    <span className="material-symbols-outlined text-base text-slate-600">arrow_upward</span>
                                  </button>
                                  <button
                                    onClick={() => { void handleMoveSubcategory(category.id, normalizedSubIndex, 1); }}
                                    disabled={isMutating || isSearchActive || isLastSubcategory}
                                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
                                    aria-label={t('admin.categories.moveDown')}
                                  >
                                    <span className="material-symbols-outlined text-base text-slate-600">arrow_downward</span>
                                  </button>
                                  <button
                                    onClick={() => { void handleToggleSubcategory(subcategory); }}
                                    disabled={isMutating}
                                    className={`p-1 rounded ${subcategory.isActive ? 'text-green-700 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                    aria-label={t('admin.categories.toggleActive')}
                                  >
                                    <span className="material-symbols-outlined text-base">{subcategory.isActive ? 'toggle_on' : 'toggle_off'}</span>
                                  </button>
                                  <button
                                    onClick={() => setEditingSubcategory({ parentId: category.id, subcategory: { ...subcategory } })}
                                    disabled={isMutating}
                                    className="p-1 rounded hover:bg-slate-100 text-slate-600"
                                    aria-label={t('common.edit')}
                                  >
                                    <span className="material-symbols-outlined text-base">edit</span>
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget({
                                      id: subcategory.id,
                                      name: getSubcategoryLabel(subcategory.name, category.name),
                                      type: 'subcategory',
                                      parentId: category.id
                                    })}
                                    disabled={isMutating}
                                    className="p-1 rounded hover:bg-red-50 text-red-600"
                                    aria-label={t('common.delete')}
                                  >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                  </button>
                                </div>
                              </div>
                            )})}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </>
        )}
        </div>
      </PortalPageShell>

      {isAddCategoryModalOpen && (
        <ModalBackdrop onClose={() => setIsAddCategoryModalOpen(false)}>
          <ModalCard
            title={t('admin.categories.addCategory')}
            onClose={() => setIsAddCategoryModalOpen(false)}
            closeAriaLabel={t('common.close')}
          >
            <div className="space-y-4">
              <InputField
                label={t('admin.categories.categoryName')}
                value={newCategory.name}
                onChange={(value) => setNewCategory((prev) => ({ ...prev, name: value }))}
                placeholder={t('admin.categories.categoryNamePlaceholder')}
              />
              <InputField
                label={t('admin.categories.iconName')}
                value={newCategory.icon}
                onChange={(value) => setNewCategory((prev) => ({ ...prev, icon: value }))}
                placeholder={t('admin.categories.iconCategoryPlaceholder')}
              />
              <InputField
                label={t('admin.categories.sortOrder')}
                value={String(newCategory.sortOrder)}
                type="number"
                onChange={(value) => setNewCategory((prev) => ({ ...prev, sortOrder: toSafeOrder(value, categories.length + 1) }))}
              />
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{t('admin.categories.active')}</span>
                <button
                  onClick={() => setNewCategory((prev) => ({ ...prev, isActive: !prev.isActive }))}
                  className="text-[#137fec]"
                  aria-label={t('admin.categories.toggleActive')}
                >
                  <span className="material-symbols-outlined">{newCategory.isActive ? 'toggle_on' : 'toggle_off'}</span>
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsAddCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => { void handleCreateCategory(); }}
                  disabled={isMutating || !newCategory.name.trim()}
                  className="px-5 py-2 rounded-lg bg-[#0A2540] text-white font-semibold hover:bg-[#0A2540]/90 disabled:opacity-50"
                >
                  {t('common.create')}
                </button>
              </div>
            </div>
          </ModalCard>
        </ModalBackdrop>
      )}

      {isAddSubcategoryModalOpen && (
        <ModalBackdrop onClose={() => setIsAddSubcategoryModalOpen(false)}>
          <ModalCard
            title={t('admin.categories.addSubcategory')}
            onClose={() => setIsAddSubcategoryModalOpen(false)}
            closeAriaLabel={t('common.close')}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('admin.categories.parentCategory')}
                </label>
                <select
                  value={newSubcategory.parentId}
                  onChange={(event) => {
                    const parentId = event.target.value;
                    resetSubcategoryDraft(parentId);
                    setNewSubcategory((prev) => ({ ...prev, parentId }));
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
                >
                  <option value="">{t('common.select')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{getCategoryLabel(category.name)}</option>
                  ))}
                </select>
              </div>
              <InputField
                label={t('admin.categories.subcategoryName')}
                value={newSubcategory.name}
                onChange={(value) => setNewSubcategory((prev) => ({ ...prev, name: value }))}
                placeholder={t('admin.categories.subcategoryNamePlaceholder')}
              />
              <InputField
                label={t('admin.categories.iconName')}
                value={newSubcategory.icon}
                onChange={(value) => setNewSubcategory((prev) => ({ ...prev, icon: value }))}
                placeholder={t('admin.categories.iconSubcategoryPlaceholder')}
              />
              <InputField
                label={t('admin.categories.sortOrder')}
                value={String(newSubcategory.sortOrder)}
                type="number"
                onChange={(value) => setNewSubcategory((prev) => ({ ...prev, sortOrder: toSafeOrder(value, prev.sortOrder) }))}
              />
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{t('admin.categories.active')}</span>
                <button
                  onClick={() => setNewSubcategory((prev) => ({ ...prev, isActive: !prev.isActive }))}
                  className="text-[#137fec]"
                  aria-label={t('admin.categories.toggleActive')}
                >
                  <span className="material-symbols-outlined">{newSubcategory.isActive ? 'toggle_on' : 'toggle_off'}</span>
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsAddSubcategoryModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => { void handleCreateSubcategory(); }}
                  disabled={isMutating || !newSubcategory.name.trim() || !newSubcategory.parentId}
                  className="px-5 py-2 rounded-lg bg-[#0A2540] text-white font-semibold hover:bg-[#0A2540]/90 disabled:opacity-50"
                >
                  {t('common.create')}
                </button>
              </div>
            </div>
          </ModalCard>
        </ModalBackdrop>
      )}

      {editingCategory && (
        <ModalBackdrop onClose={() => setEditingCategory(null)}>
          <ModalCard
            title={t('admin.categories.editCategory')}
            onClose={() => setEditingCategory(null)}
            closeAriaLabel={t('common.close')}
          >
            <div className="space-y-4">
              <InputField
                label={t('admin.categories.categoryName')}
                value={editingCategory.name}
                onChange={(value) => setEditingCategory((prev) => prev ? { ...prev, name: value } : prev)}
              />
              <InputField
                label={t('admin.categories.iconName')}
                value={editingCategory.icon}
                onChange={(value) => setEditingCategory((prev) => prev ? { ...prev, icon: value } : prev)}
              />
              <InputField
                label={t('admin.categories.sortOrder')}
                value={String(editingCategory.sortOrder)}
                type="number"
                onChange={(value) => setEditingCategory((prev) => prev ? { ...prev, sortOrder: toSafeOrder(value, prev.sortOrder) } : prev)}
              />
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{t('admin.categories.active')}</span>
                <button
                  onClick={() => setEditingCategory((prev) => prev ? { ...prev, isActive: !prev.isActive } : prev)}
                  className="text-[#137fec]"
                >
                  <span className="material-symbols-outlined">{editingCategory.isActive ? 'toggle_on' : 'toggle_off'}</span>
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => { void handleSaveCategory(); }}
                  disabled={isMutating || !editingCategory.name.trim()}
                  className="px-5 py-2 rounded-lg bg-[#0A2540] text-white font-semibold hover:bg-[#0A2540]/90 disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </ModalCard>
        </ModalBackdrop>
      )}

      {editingSubcategory && (
        <ModalBackdrop onClose={() => setEditingSubcategory(null)}>
          <ModalCard
            title={t('admin.categories.editSubcategory')}
            onClose={() => setEditingSubcategory(null)}
            closeAriaLabel={t('common.close')}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('admin.categories.parentCategory')}
                </label>
                <select
                  value={editingSubcategory.parentId}
                  onChange={(event) => setEditingSubcategory((prev) => prev ? { ...prev, parentId: event.target.value } : prev)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{getCategoryLabel(category.name)}</option>
                  ))}
                </select>
              </div>
              <InputField
                label={t('admin.categories.subcategoryName')}
                value={editingSubcategory.subcategory.name}
                onChange={(value) => setEditingSubcategory((prev) => prev ? {
                  ...prev,
                  subcategory: { ...prev.subcategory, name: value },
                } : prev)}
              />
              <InputField
                label={t('admin.categories.iconName')}
                value={editingSubcategory.subcategory.icon}
                onChange={(value) => setEditingSubcategory((prev) => prev ? {
                  ...prev,
                  subcategory: { ...prev.subcategory, icon: value },
                } : prev)}
              />
              <InputField
                label={t('admin.categories.sortOrder')}
                value={String(editingSubcategory.subcategory.sortOrder)}
                type="number"
                onChange={(value) => setEditingSubcategory((prev) => prev ? {
                  ...prev,
                  subcategory: { ...prev.subcategory, sortOrder: toSafeOrder(value, prev.subcategory.sortOrder) },
                } : prev)}
              />
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{t('admin.categories.active')}</span>
                <button
                  onClick={() => setEditingSubcategory((prev) => prev ? {
                    ...prev,
                    subcategory: { ...prev.subcategory, isActive: !prev.subcategory.isActive },
                  } : prev)}
                  className="text-[#137fec]"
                >
                  <span className="material-symbols-outlined">{editingSubcategory.subcategory.isActive ? 'toggle_on' : 'toggle_off'}</span>
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setEditingSubcategory(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => { void handleSaveSubcategory(); }}
                  disabled={isMutating || !editingSubcategory.subcategory.name.trim() || !editingSubcategory.parentId}
                  className="px-5 py-2 rounded-lg bg-[#0A2540] text-white font-semibold hover:bg-[#0A2540]/90 disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </ModalCard>
        </ModalBackdrop>
      )}

      {deleteTarget && (
        <ModalBackdrop onClose={() => setDeleteTarget(null)}>
          <ModalCard
            title={t('admin.categories.confirmDelete')}
            onClose={() => setDeleteTarget(null)}
            closeAriaLabel={t('common.close')}
          >
            <div className="space-y-5">
              <p className="text-sm text-gray-700">
                {t('admin.categories.deleteWarning', { name: deleteTarget.name })}
              </p>
              {deleteTarget.type === 'category' && (
                <p className="text-xs text-red-600">
                  {t('admin.categories.deleteSubcategoriesWarning')}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => { void handleDelete(); }}
                  disabled={isMutating}
                  className="px-5 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </ModalCard>
        </ModalBackdrop>
      )}
    </div>
  );
};

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'emerald' | 'amber';
}) {
  const colorMap: Record<'blue' | 'green' | 'emerald' | 'amber', string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${colorMap[color]}`}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}

function ModalCard({
  title,
  onClose,
  closeAriaLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  closeAriaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <button onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label={closeAriaLabel}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0A2540] focus:border-transparent"
      />
    </label>
  );
}
