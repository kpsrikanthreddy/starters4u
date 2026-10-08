import { initializeDatabase, query, isPostgresRunning } from '../server/db.js';
import { createOrder, getOrderById } from '../server/services/orderService.js';
import {
  calculateItemLinePricing,
  calculateDeliveryMarkupRupees,
  calculateDeliveryMarkupPaise,
  getDeliveryPricing,
} from '../src/utils/deliveryPricing.js';
import { getAuthoritativeItemPrice } from '../server/services/deliveryPricingEngine.js';

async function runTest() {
  console.log('=============================================================');
  console.log('TESTING ZERO PLATFORM MARKUP & EXACT PRICE CONVERSIONS');
  console.log('=============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  await initializeDatabase();

  // Test 1: Utility Pricing Functions
  console.log('\n[1] Delivery Pricing Utilities Validation');
  assert(calculateDeliveryMarkupRupees(99) === 0, 'calculateDeliveryMarkupRupees(99) returns 0');
  assert(calculateDeliveryMarkupRupees(137) === 0, 'calculateDeliveryMarkupRupees(137) returns 0');
  assert(calculateDeliveryMarkupPaise(9900) === 0, 'calculateDeliveryMarkupPaise(9900) returns 0');
  assert(calculateDeliveryMarkupPaise(13700) === 0, 'calculateDeliveryMarkupPaise(13700) returns 0');

  const pricing99 = calculateItemLinePricing(99, 1, 'delivery');
  assert(pricing99.baseUnitPricePaise === 9900, 'calculateItemLinePricing(99) baseUnitPricePaise is 9900');
  assert(pricing99.platformMarkupUnitPaise === 0, 'calculateItemLinePricing(99) platformMarkupUnitPaise is 0');
  assert(pricing99.customerUnitPricePaise === 9900, 'calculateItemLinePricing(99) customerUnitPricePaise is 9900');
  assert(pricing99.customerUnitPrice === 99, 'calculateItemLinePricing(99) customerUnitPrice is 99.00');

  const pricing137 = calculateItemLinePricing(137, 1, 'delivery');
  assert(pricing137.baseUnitPricePaise === 13700, 'calculateItemLinePricing(137) baseUnitPricePaise is 13700');
  assert(pricing137.platformMarkupUnitPaise === 0, 'calculateItemLinePricing(137) platformMarkupUnitPaise is 0');
  assert(pricing137.customerUnitPricePaise === 13700, 'calculateItemLinePricing(137) customerUnitPricePaise is 13700');
  assert(pricing137.customerUnitPrice === 137, 'calculateItemLinePricing(137) customerUnitPrice is 137.00');

  const auth99 = await getAuthoritativeItemPrice(99, 'delivery');
  assert(auth99.baseUnitPricePaise === 9900, 'getAuthoritativeItemPrice(99) baseUnitPricePaise is 9900');
  assert(auth99.platformMarkupUnitPaise === 0, 'getAuthoritativeItemPrice(99) platformMarkupUnitPaise is 0');
  assert(auth99.customerUnitPricePaise === 9900, 'getAuthoritativeItemPrice(99) customerUnitPricePaise is 9900');
  assert(auth99.customerUnitPrice === 99, 'getAuthoritativeItemPrice(99) customerUnitPrice is 99.00');

  const auth137 = await getAuthoritativeItemPrice(137, 'delivery');
  assert(auth137.baseUnitPricePaise === 13700, 'getAuthoritativeItemPrice(137) baseUnitPricePaise is 13700');
  assert(auth137.platformMarkupUnitPaise === 0, 'getAuthoritativeItemPrice(137) platformMarkupUnitPaise is 0');
  assert(auth137.customerUnitPricePaise === 13700, 'getAuthoritativeItemPrice(137) customerUnitPricePaise is 13700');
  assert(auth137.customerUnitPrice === 137, 'getAuthoritativeItemPrice(137) customerUnitPrice is 137.00');

  // Test 2: Order Creation with ₹99 and ₹137 items
  console.log('\n[2] Order Creation with Example Items (₹99 and ₹137)');
  const order = await createOrder({
    restaurantId: 'a0000000-0000-0000-0000-000000000001',
    branchId: 'b0000000-0000-0000-0000-000000000001',
    orderType: 'delivery',
    entrySource: 'customer_web',
    paymentMethod: 'cod',
    customer: {
      name: 'Ravi Kumar',
      phone: '9845099137',
      address: 'Madhapur, Hyderabad',
      latitude: 17.4482,
      longitude: 78.3914,
    },
    items: [
      {
        cartItemId: 'c-99',
        menuItem: {
          id: 'test-item-99',
          name: 'Item A (₹99)',
          price: 99,
          category: 'pocket_pizza_veg',
          dietary: 'veg',
          description: '',
          inStock: true,
        },
        unitPrice: 99,
        quantity: 1,
        addons: [],
      },
      {
        cartItemId: 'c-137',
        menuItem: {
          id: 'test-item-137',
          name: 'Item B (₹137)',
          price: 137,
          category: 'pocket_pizza_veg',
          dietary: 'veg',
          description: '',
          inStock: true,
        },
        unitPrice: 137,
        quantity: 2,
        addons: [],
      },
    ],
  });

  assert(Boolean(order?.id), 'Order created successfully');
  assert(order.items.length === 2, 'Order has 2 items');

  const itemA = order.items.find((i) => i.menuItem?.name === 'Item A (₹99)');
  assert(Boolean(itemA), 'Found Item A');
  assert(itemA!.unitPrice === 99, 'Item A unit_price is 99.00');
  assert(itemA!.baseUnitPrice === 99, 'Item A base_unit_price is 99.00');
  assert(itemA!.platformMarkupUnit === 0, 'Item A platform_markup_unit is 0.00');
  assert(itemA!.baseUnitPricePaise === 9900, 'Item A base_unit_price_paise is 9900');
  assert(itemA!.platformMarkupUnitPaise === 0, 'Item A platform_markup_unit_paise is 0');
  assert(itemA!.customerUnitPricePaise === 9900, 'Item A customer_unit_price_paise is 9900');

  const itemB = order.items.find((i) => i.menuItem?.name === 'Item B (₹137)');
  assert(Boolean(itemB), 'Found Item B');
  assert(itemB!.unitPrice === 137, 'Item B unit_price is 137.00');
  assert(itemB!.baseUnitPrice === 137, 'Item B base_unit_price is 137.00');
  assert(itemB!.platformMarkupUnit === 0, 'Item B platform_markup_unit is 0.00');
  assert(itemB!.baseUnitPricePaise === 13700, 'Item B base_unit_price_paise is 13700');
  assert(itemB!.platformMarkupUnitPaise === 0, 'Item B platform_markup_unit_paise is 0');
  assert(itemB!.customerUnitPricePaise === 13700, 'Item B customer_unit_price_paise is 13700');

  assert(order.platformMarkupTotal === 0, 'Order platformMarkupTotal is 0');

  // Test 3: Raw PostgreSQL Database Columns Verification
  if (isPostgresRunning()) {
    console.log('\n[3] Raw PostgreSQL Database Row Verification');
    const res = await query(
      `SELECT item_name, unit_price, base_unit_price, platform_markup_unit,
              base_unit_price_paise, platform_markup_unit_paise, customer_unit_price_paise
       FROM order_items WHERE order_id = $1 ORDER BY unit_price ASC`,
      [order.id]
    );

    assert(res.rows.length === 2, 'Queried 2 order_items from PostgreSQL');
    const row99 = res.rows[0];
    assert(Number(row99.unit_price) === 99, 'PG row 99 unit_price is 99.00');
    assert(Number(row99.base_unit_price_paise) === 9900, 'PG row 99 base_unit_price_paise is 9900');
    assert(Number(row99.platform_markup_unit_paise) === 0, 'PG row 99 platform_markup_unit_paise is 0');
    assert(Number(row99.customer_unit_price_paise) === 9900, 'PG row 99 customer_unit_price_paise is 9900');

    const row137 = res.rows[1];
    assert(Number(row137.unit_price) === 137, 'PG row 137 unit_price is 137.00');
    assert(Number(row137.base_unit_price_paise) === 13700, 'PG row 137 base_unit_price_paise is 13700');
    assert(Number(row137.platform_markup_unit_paise) === 0, 'PG row 137 platform_markup_unit_paise is 0');
    assert(Number(row137.customer_unit_price_paise) === 13700, 'PG row 137 customer_unit_price_paise is 13700');
  }

  console.log('\n=============================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Fatal error in pricing test:', err);
  process.exit(1);
});
