
export interface SubcategoryDefinition {
    name: string;
    icon: string;
    translationKey: string;
}

export interface CategoryDefinition {
    name: string;
    subcategories: SubcategoryDefinition[];
}

// Default system hierarchy (moved from ClientPortal)
const DEFAULT_HIERARCHY: Record<string, SubcategoryDefinition[]> = {
    'Office': [
        { name: 'Paper', icon: 'description', translationKey: 'subcategories.office.paper' },
        { name: 'Pens', icon: 'edit', translationKey: 'subcategories.office.pens' },
        { name: 'Notepads & Notebooks', icon: 'menu_book', translationKey: 'subcategories.office.notepads' },
        { name: 'Desk Accessories', icon: 'desk', translationKey: 'subcategories.office.deskAccessories' },
        { name: 'Filing & Storage', icon: 'folder_open', translationKey: 'subcategories.office.filing' },
        { name: 'Printers & Ink', icon: 'print', translationKey: 'subcategories.office.printers' },
    ],
    'IT Supplies': [
        { name: 'Laptops', icon: 'laptop_mac', translationKey: 'subcategories.it.laptops' },
        { name: 'Monitors', icon: 'monitor', translationKey: 'subcategories.it.monitors' },
        { name: 'Audio', icon: 'headphones', translationKey: 'subcategories.it.audio' },
        { name: 'Networking', icon: 'router', translationKey: 'subcategories.it.networking' },
        { name: 'Peripherals', icon: 'mouse', translationKey: 'subcategories.it.peripherals' },
        { name: 'Storage', icon: 'storage', translationKey: 'subcategories.it.storage' },
    ],
    'Breakroom': [
        { name: 'Coffee & Tea', icon: 'coffee', translationKey: 'subcategories.breakroom.coffeeTea' },
        { name: 'Snacks & Food', icon: 'restaurant', translationKey: 'subcategories.breakroom.snacks' },
        { name: 'Drinks', icon: 'local_drink', translationKey: 'subcategories.breakroom.drinks' },
    ],
    'Janitorial': [
        { name: 'Cleaning Chemicals', icon: 'cleaning_services', translationKey: 'subcategories.janitorial.chemicals' },
        { name: 'Paper Products', icon: 'toilet_paper', translationKey: 'subcategories.janitorial.paper' },
        { name: 'Trash Bags', icon: 'delete', translationKey: 'subcategories.janitorial.trashBags' },
        { name: 'Tools', icon: 'build', translationKey: 'subcategories.janitorial.tools' },
    ],
    'Maintenance': [
        { name: 'Tools', icon: 'construction', translationKey: 'subcategories.maintenance.tools' },
        { name: 'Lighting', icon: 'lightbulb', translationKey: 'subcategories.maintenance.lighting' },
        { name: 'Safety', icon: 'health_and_safety', translationKey: 'subcategories.maintenance.safety' },
        { name: 'Hardware', icon: 'hardware', translationKey: 'subcategories.maintenance.hardware' },
    ],
};

export const categoryService = {
    /**
     * Returns the full category hierarchy.
     * In the future, this can merge DB categories with system defaults.
     */
    getCategoryTree(): Record<string, SubcategoryDefinition[]> {
        return DEFAULT_HIERARCHY;
    },

    /**
     * Returns a flat list of main category names.
     */
    getMainCategories(): string[] {
        return Object.keys(DEFAULT_HIERARCHY);
    },

    /**
     * Returns subcategories for a specific category.
     */
    getSubcategories(categoryName: string): SubcategoryDefinition[] {
        return DEFAULT_HIERARCHY[categoryName] || [];
    }
};
