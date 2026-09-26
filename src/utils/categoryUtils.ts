import { MenuItem, FoodCategory } from '../types';

/**
 * Normalizes any category string (from legacy data, user input, URL query, or DB)
 * into a stable, canonical snake_case slug.
 */
export function normalizeCategorySlug(raw: string | undefined | null): string {
  if (!raw) return 'all';
  const clean = decodeURIComponent(raw)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '');

  if (clean === 'all' || clean === 'all items' || clean === 'all-items') {
    return 'all';
  }

  // Veg Pocket Pizzas
  if (
    clean === 'pocket_pizza_veg' ||
    clean === 'pocket-pizza-veg' ||
    clean === 'pocket pizza veg' ||
    clean === 'veg pocket pizza' ||
    clean === 'veg pocket pizzas' ||
    clean === 'pocket pizza (veg)' ||
    clean === 'veg pizza' ||
    clean === 'veg pocket'
  ) {
    return 'pocket_pizza_veg';
  }

  // Non-Veg Pocket Pizzas
  if (
    clean === 'pocket_pizza_nonveg' ||
    clean === 'pocket-pizza-nonveg' ||
    clean === 'pocket pizza nonveg' ||
    clean === 'pocket pizza non-veg' ||
    clean === 'pocket pizza non veg' ||
    clean === 'non-veg pocket pizza' ||
    clean === 'non-veg pocket pizzas' ||
    clean === 'non veg pocket pizza' ||
    clean === 'non veg pocket pizzas' ||
    clean === 'pocket pizza (non-veg)' ||
    clean === 'non-veg pizza' ||
    clean === 'chicken pocket pizza'
  ) {
    return 'pocket_pizza_nonveg';
  }

  // Dessert Pizzas
  if (
    clean === 'dessert_pizza' ||
    clean === 'dessert-pizza' ||
    clean === 'dessert pizza' ||
    clean === 'dessert pizzas' ||
    clean === 'sweet pizza' ||
    clean === 'chocolate pizza'
  ) {
    return 'dessert_pizza';
  }

  // Chinese Starters
  if (
    clean === 'chinese_starters' ||
    clean === 'chinese-starters' ||
    clean === 'chinese starters' ||
    clean === 'chinese starters gachibowli' ||
    clean === 'chinese-starters-gachibowli' ||
    clean === 'chinese starter' ||
    clean === 'starters' ||
    clean === 'chinese'
  ) {
    return 'chinese_starters';
  }

  // Fried Rice
  if (
    clean === 'fried_rice' ||
    clean === 'fried-rice' ||
    clean === 'fried rice' ||
    clean.includes('fried rice')
  ) {
    return 'fried_rice';
  }

  // Noodles
  if (
    clean === 'noodles' ||
    clean === 'noodle' ||
    clean === 'wok noodles' ||
    clean === 'wok-noodles' ||
    clean.includes('noodle')
  ) {
    return 'noodles';
  }

  // Maggie
  if (
    clean === 'maggie' ||
    clean === 'maggies' ||
    clean === 'special maggie' ||
    clean === 'special-maggie' ||
    clean.includes('maggie')
  ) {
    return 'maggie';
  }

  // Momos
  if (
    clean === 'momos' ||
    clean === 'momo' ||
    clean === "momo's" ||
    clean === 'momos & dimsums' ||
    clean === 'momos-gachibowli' ||
    clean === 'momos gachibowli' ||
    clean.includes('momo')
  ) {
    return 'momos';
  }

  // Drinks
  if (
    clean === 'drinks' ||
    clean === 'drink' ||
    clean === 'beverages' ||
    clean === 'beverage' ||
    clean === 'beverages & drinks' ||
    clean.includes('beverage') ||
    clean.includes('drink')
  ) {
    return 'drinks';
  }

  // Pocket Pizzas group aggregator
  if (
    clean === 'pocket_pizzas' ||
    clean === 'pocket-pizzas' ||
    clean === 'pocket pizzas' ||
    clean === 'pocket pizza' ||
    clean === 'pizza' ||
    clean === 'pizzas'
  ) {
    return 'pocket_pizzas';
  }

  // Generic fallback: replace non-alphanumerics with single underscores
  return clean
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Checks if a menu item matches the targeted category filter,
 * taking into account normalized slugs, aggregated groups (e.g., all pocket pizzas),
 * and dynamic categories.
 */
export function isCategoryMatch(itemCategory: string | undefined | null, targetCategory: string | undefined | null): boolean {
  if (!targetCategory || targetCategory === 'all') return true;
  const normalizedTarget = normalizeCategorySlug(targetCategory);
  const normalizedItem = normalizeCategorySlug(itemCategory);

  if (normalizedTarget === 'all') return true;
  if (normalizedTarget === normalizedItem) return true;

  // Pocket pizzas aggregated filter matches all pocket pizza variants
  if (
    normalizedTarget === 'pocket_pizzas' &&
    (normalizedItem === 'pocket_pizza_veg' ||
      normalizedItem === 'pocket_pizza_nonveg' ||
      normalizedItem === 'dessert_pizza' ||
      normalizedItem.includes('pizza'))
  ) {
    return true;
  }

  return false;
}

/**
 * Returns a human-friendly display name for any category slug.
 */
export function getCategoryDisplayName(categorySlug: string): string {
  const norm = normalizeCategorySlug(categorySlug);
  const KNOWN_LABELS: Record<string, string> = {
    all: 'All Items',
    pocket_pizza_veg: 'Veg Pocket Pizzas',
    pocket_pizza_nonveg: 'Non-Veg Pocket Pizzas',
    dessert_pizza: 'Dessert Pizzas',
    pocket_pizzas: 'All Pocket Pizzas',
    chinese_starters: 'Chinese Starters',
    fried_rice: 'Fried Rice',
    noodles: 'Noodles',
    maggie: 'Maggie',
    momos: "Momo's",
    drinks: 'Drinks',
  };

  if (KNOWN_LABELS[norm]) return KNOWN_LABELS[norm];

  // Format custom slug e.g. "rolls_and_wraps" -> "Rolls And Wraps"
  return norm
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Returns an appropriate icon emoji for standard categories or custom ones.
 */
export function getCategoryIcon(categorySlug: string): string {
  const norm = normalizeCategorySlug(categorySlug);
  const ICONS: Record<string, string> = {
    all: '✨',
    pocket_pizza_veg: '🍕',
    pocket_pizza_nonveg: '🍗',
    dessert_pizza: '🍫',
    pocket_pizzas: '🍕',
    chinese_starters: '🥟',
    fried_rice: '🍚',
    noodles: '🍜',
    maggie: '🥢',
    momos: '🥟',
    drinks: '🥤',
  };
  return ICONS[norm] || '🍽️';
}

export interface DynamicCategoryTab {
  id: string;
  name: string;
  icon: string;
  count: number;
}

/**
 * Generates dynamic category tabs based on active menu items.
 * Standard categories are kept in preferred order, and any newly created
 * categories with active in-stock items are automatically appended.
 */
export function getActiveCategoryTabs(menu: MenuItem[], includeAll: boolean = true): DynamicCategoryTab[] {
  // Requirement 5: Only count items that are in stock (inStock !== false)
  const activeItems = menu.filter((item) => item.inStock !== false);

  const countsBySlug = new Map<string, number>();
  for (const item of activeItems) {
    const slug = normalizeCategorySlug(item.category);
    countsBySlug.set(slug, (countsBySlug.get(slug) || 0) + 1);
  }

  // Multi-tenant check: Collect all categories present in this restaurant's menu
  const menuCategories = new Set<string>();
  for (const item of menu) {
    if (item.category) {
      menuCategories.add(normalizeCategorySlug(item.category));
    }
  }

  const standardSlugs = [
    'pocket_pizza_veg',
    'pocket_pizza_nonveg',
    'dessert_pizza',
    'chinese_starters',
    'fried_rice',
    'noodles',
    'maggie',
    'momos',
    'drinks',
  ];

  const tabs: DynamicCategoryTab[] = [];
  if (includeAll) {
    tabs.push({
      id: 'all',
      name: 'All Items',
      icon: '✨',
      count: activeItems.length,
    });
  }

  // Add standard categories that actually exist in this restaurant's menu (or if menu is empty, fallback)
  const hasSpecificMenuCategories = menuCategories.size > 0;
  for (const slug of standardSlugs) {
    if (!hasSpecificMenuCategories || menuCategories.has(slug)) {
      const count = countsBySlug.get(slug) || 0;
      tabs.push({
        id: slug,
        name: getCategoryDisplayName(slug),
        icon: getCategoryIcon(slug),
        count,
      });
    }
  }

  // Add newly created or custom restaurant-specific categories
  for (const slug of menuCategories) {
    if (!standardSlugs.includes(slug) && slug !== 'all') {
      const count = countsBySlug.get(slug) || 0;
      tabs.push({
        id: slug,
        name: getCategoryDisplayName(slug),
        icon: getCategoryIcon(slug),
        count,
      });
    }
  }

  return tabs;
}
