# MWRD Retail Pricing System

Complete guide to the automatic retail pricing with margin calculation.

## Overview

MWRD operates as a B2B marketplace where:
- **Suppliers** set cost prices
- **MWRD** adds margins automatically
- **Clients** see final retail prices (cost + margin)
- **MWRD** earns the margin on every sale

## How It Works

### 1. Price Calculation Formula

```
Retail Price = Cost Price × (1 + Margin % / 100)
```

**Example:**
```
Cost Price: 100 SAR
Margin: 15%
Retail Price: 100 × (1 + 15/100) = 115 SAR
MWRD Profit: 15 SAR
```

### 2. Automatic Margin Application

Margins are applied automatically based on product category:

| Category | Default Margin |
|----------|----------------|
| Office Furniture | 10% |
| Electronics | 15% |
| Footwear | 12% |
| Safety Gear | 20% |
| **Default (all others)** | **15%** |

Admins can configure custom margins per category in the `margin_settings` table.

### 3. Price Visibility by Role

**Clients See:**
- ✅ Retail Price (with margin)
- ✅ Product details
- ❌ Cost Price (hidden)
- ❌ Margin Percentage (hidden)

**Suppliers See:**
- ✅ Their Cost Price
- ✅ Retail Price
- ✅ Margin Percentage
- ✅ MWRD's Profit

**Admins See:**
- ✅ All pricing details
- ✅ Cost, Margin, Retail
- ✅ Total profit per product
- ✅ Can adjust margins

## Database Schema

### Products Table Fields

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  cost_price DECIMAL(10, 2),      -- Supplier's price
  retail_price DECIMAL(10, 2),    -- Auto-calculated: cost × (1 + margin)
  margin_percent DECIMAL(5, 2),   -- Applied margin (e.g., 15.00)
  category TEXT,
  status product_status,
  -- ... other fields
);
```

### Margin Settings Table

```sql
CREATE TABLE margin_settings (
  id UUID PRIMARY KEY,
  category TEXT UNIQUE,           -- NULL = default margin
  margin_percent DECIMAL(5, 2),   -- e.g., 15.00 for 15%
  is_default BOOLEAN,
  -- ... timestamps
);
```

## Automatic Triggers

### Auto-Calculate Retail Price

When a product is created or cost price is updated:

1. **Lookup Margin**
   - Find margin for product's category
   - If no category margin, use default margin
   - Default is 15% if nothing configured

2. **Calculate Retail Price**
   ```sql
   retail_price = cost_price * (1 + margin_percent / 100)
   ```

3. **Store Values**
   - Save `retail_price`
   - Save `margin_percent` used

### Trigger Code

```sql
CREATE TRIGGER calculate_product_retail_price
  BEFORE INSERT OR UPDATE OF cost_price, category ON products
  FOR EACH ROW
  EXECUTE FUNCTION calculate_retail_price();
```

## Usage Examples

### Example 1: Create Product with Auto-Pricing

```typescript
// Supplier creates product
const product = {
  name: 'Executive Office Chair',
  costPrice: 185.00,  // Supplier's price
  category: 'Office Furniture',
  // ... other fields
};

// After insert:
// margin_percent: 10% (Office Furniture margin)
// retail_price: 203.50 SAR (185 × 1.10)
// MWRD profit: 18.50 SAR
```

### Example 2: Display Product to Client

```tsx
<ProductCard product={product} userRole={UserRole.CLIENT} />
// Shows: 203.50 SAR
// Hides: Cost price, margin
```

### Example 3: Display Product to Supplier

```tsx
<ProductCard product={product} userRole={UserRole.SUPPLIER} />
// Shows:
// - Cost: 185.00 SAR
// - Margin: 10%
// - Retail: 203.50 SAR
// - MWRD Profit: 18.50 SAR
```

### Example 4: Update Margin for Category

```sql
-- Admin updates margin for Electronics
UPDATE margin_settings
SET margin_percent = 18.00
WHERE category = 'Electronics';

-- Refresh all Electronics product prices
SELECT update_category_retail_prices('Electronics');
```

## Helper Functions

### 1. Get Product Retail Price

```sql
SELECT get_product_retail_price('product-uuid');
```

### 2. Update Category Prices

```sql
-- Recalculate all products in a category
SELECT update_category_retail_prices('Office Furniture');
-- Returns: number of products updated
```

### 3. Refresh All Prices

```sql
-- Recalculate ALL product prices
-- (Use when changing default margin)
SELECT refresh_all_retail_prices();
-- Returns: total products updated
```

## Admin Operations

### Configure Category Margin

```sql
-- Set 20% margin for Safety Gear
INSERT INTO margin_settings (category, margin_percent, is_default)
VALUES ('Safety Gear', 20.00, FALSE)
ON CONFLICT (category)
DO UPDATE SET margin_percent = 20.00;

-- Refresh prices for that category
SELECT update_category_retail_prices('Safety Gear');
```

### Change Default Margin

```sql
-- Change default from 15% to 18%
UPDATE margin_settings
SET margin_percent = 18.00
WHERE is_default = TRUE;

-- Refresh all products using default
SELECT refresh_all_retail_prices();
```

### View Profit Analysis

```sql
-- See profit margins across all products
SELECT
  category,
  COUNT(*) as products,
  AVG(margin_percent) as avg_margin,
  SUM(retail_price - cost_price) as total_potential_profit
FROM products
WHERE status = 'APPROVED' AND cost_price IS NOT NULL
GROUP BY category
ORDER BY total_potential_profit DESC;
```

## Client View

The `client_products` view provides a clean interface for clients:

```sql
CREATE VIEW client_products AS
SELECT
  id,
  name,
  description,
  category,
  image,
  retail_price,  -- Only retail price visible
  sku
FROM products
WHERE status = 'APPROVED';
```

Clients query this view and only see retail prices.

## API Integration

### TypeScript Service Example

```typescript
import { supabase } from './supabase';

// Get products for client (retail prices only)
export async function getClientProducts() {
  const { data } = await supabase
    .from('client_products')
    .select('*')
    .order('name');

  return data; // Only retail_price included
}

// Get products for supplier (all details)
export async function getSupplierProducts(supplierId: string) {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('supplier_id', supplierId);

  return data; // Includes cost_price, retail_price, margin_percent
}
```

## Testing

### Test Auto-Calculation

```sql
-- Insert test product
INSERT INTO products (
  supplier_id,
  name,
  cost_price,
  category,
  status
) VALUES (
  'supplier-uuid',
  'Test Product',
  100.00,
  'Electronics',
  'APPROVED'
) RETURNING cost_price, margin_percent, retail_price;

-- Expected output:
-- cost_price: 100.00
-- margin_percent: 15.00
-- retail_price: 115.00
```

### Verify Margins

```sql
-- Show all products with pricing details
SELECT
  name,
  category,
  cost_price,
  margin_percent || '%' as margin,
  retail_price,
  (retail_price - cost_price) as profit
FROM products
WHERE cost_price IS NOT NULL
ORDER BY category, name;
```

## Common Scenarios

### Scenario 1: Supplier Updates Cost Price

1. Supplier changes cost from 100 → 120 SAR
2. Trigger fires automatically
3. Retail price updates: 120 × 1.15 = 138 SAR
4. Clients see new price immediately

### Scenario 2: Admin Changes Category Margin

1. Admin changes Electronics margin: 15% → 18%
2. Run: `SELECT update_category_retail_prices('Electronics')`
3. All Electronics products recalculate
4. Clients see updated prices

### Scenario 3: New Product Category

1. Supplier adds product in new category "Industrial Tools"
2. No specific margin configured
3. System uses default margin (15%)
4. Admin can set custom margin later

## Best Practices

1. **Set margins before adding products**
   - Configure `margin_settings` first
   - Avoids need to refresh prices later

2. **Communicate margin changes**
   - Notify suppliers before changing margins
   - May affect their competitiveness

3. **Monitor profit margins**
   - Review regularly to ensure profitability
   - Adjust as needed based on market

4. **Test price changes**
   - Use staging environment
   - Verify calculations before production

5. **Document margin strategy**
   - Keep record of margin decisions
   - Maintain consistency across categories

## Troubleshooting

### Issue: Retail price not calculating

**Check:**
```sql
-- Verify cost_price is set
SELECT id, name, cost_price FROM products WHERE retail_price IS NULL;

-- Check margin_settings
SELECT * FROM margin_settings;

-- Manually trigger recalculation
UPDATE products SET cost_price = cost_price WHERE id = 'product-uuid';
```

### Issue: Wrong margin applied

**Solution:**
```sql
-- Check which margin was used
SELECT name, category, margin_percent FROM products WHERE id = 'product-uuid';

-- Verify margin_settings
SELECT category, margin_percent FROM margin_settings
ORDER BY is_default DESC, category;
```

### Issue: Client sees cost price

**Check RLS policies:**
```sql
-- Verify client is using client_products view
-- Or check RLS policy is hiding cost_price
SELECT * FROM pg_policies WHERE tablename = 'products';
```

## Future Enhancements

- [ ] Dynamic pricing based on quantity
- [ ] Seasonal margin adjustments
- [ ] Supplier-specific margins
- [ ] Price history tracking
- [ ] Bulk price updates
- [ ] Price alerts for clients
- [ ] Competitive pricing analysis

## Support

For questions about the pricing system:
- Check this documentation
- Review `margin_settings` table
- Test in staging environment
- Contact development team

---

**Last Updated:** November 2025
**Version:** 1.0
