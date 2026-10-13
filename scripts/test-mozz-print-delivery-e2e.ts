import assert from 'assert';
import { initializeDatabase, query } from '../server/db.js';
import * as printService from '../server/services/printService.js';
import * as orderService from '../server/services/orderService.js';
import * as menuService from '../server/services/menuService.js';

async function runMozzE2ETest() {
  console.log('🧪 [E2E Test] Starting MOZZ Gachibowli Print Delivery End-to-End Test...\n');

  // 1. Initialize Database
  await initializeDatabase();
  console.log('✅ 1. Database initialized');

  const mozzRestaurantId = 'a0000000-0000-0000-0000-000000000001';
  const mozzBranchId = 'b0000000-0000-0000-0000-000000000001';
  const mozzDeviceId = 'win_pos_b27tprul';

  // 2. Verify paired device exists and is registered for MOZZ Gachibowli
  const devices = await printService.getTenantDevices(mozzRestaurantId, mozzBranchId);
  console.log(`📋 Found ${devices.length} registered devices for MOZZ Gachibowli.`);
  let pairedDevice = devices.find((d) => d.deviceId === mozzDeviceId);
  if (!pairedDevice) {
    console.log('⚠️ Device win_pos_b27tprul not found in tenant list, registering...');
    const reg = await printService.registerDevice({
      restaurantId: mozzRestaurantId,
      branchId: mozzBranchId,
      deviceId: mozzDeviceId,
      deviceName: 'Cash Counter POS',
      platform: 'win32',
      appVersion: '1.0.0',
    });
    pairedDevice = reg.device;
  }
  assert(pairedDevice, 'Paired device win_pos_b27tprul must exist');
  assert.strictEqual(pairedDevice.restaurantId, mozzRestaurantId, 'Device restaurantId must match MOZZ');
  assert.strictEqual(pairedDevice.branchId, mozzBranchId, 'Device branchId must match Gachibowli');
  console.log('✅ 2. Paired device win_pos_b27tprul verified for MOZZ Gachibowli');

  // 3. Touch device heartbeat to ensure it is marked online
  await printService.touchDeviceHeartbeat(mozzDeviceId, mozzRestaurantId, mozzBranchId);
  const updatedDevs = await printService.getTenantDevices(mozzRestaurantId, mozzBranchId);
  const onlineDev = updatedDevs.find((d) => d.deviceId === mozzDeviceId);
  assert(onlineDev, 'Device must be found');
  assert.strictEqual(onlineDev.isOnline, true, 'Device must be marked isOnline: true');
  console.log('✅ 3. Device heartbeat verified (isOnline: true)');

  // 4. Create a new real MOZZ takeaway order with Chinese starter
  const menuItems = await menuService.getMenu(mozzRestaurantId);
  const chineseItem = menuItems.find((m) => m.category?.includes('chinese') || m.name.toLowerCase().includes('chicken') || m.name.toLowerCase().includes('wok')) || menuItems[0];
  assert(chineseItem, 'Chinese item must exist in MOZZ menu');

  console.log(`🛒 Creating new MOZZ order with item: "${chineseItem.name}"...`);
  const newOrder = await orderService.createOrder({
    restaurantId: mozzRestaurantId,
    branchId: mozzBranchId,
    orderType: 'takeaway',
    customer: {
      name: 'E2E Test Customer',
      phone: '9876543210',
      address: 'Plot 31, Indira Nagar, Gachibowli, Hyderabad',
    },
    items: [
      {
        cartItemId: 'e2e-cart-1',
        menuItem: chineseItem,
        quantity: 1,
        unitPrice: Number(chineseItem.price || 199),
        addons: [],
      },
    ],
    paymentMethod: 'upi_qr',
    paymentStatus: 'paid',
  });

  assert(newOrder, 'Order must be created successfully');
  console.log(`✅ 4. Order created: #${newOrder.orderNumber} (ID: ${newOrder.id})`);

  // 5. Verify KOT and BILL print jobs were created for the order
  const pendingJobs = await printService.getPrintJobs(mozzRestaurantId, mozzBranchId, 'PENDING', 50, mozzDeviceId);
  const orderJobs = pendingJobs.filter((j) => j.orderId === newOrder.id);
  assert.strictEqual(orderJobs.length, 2, 'Should create exactly 2 print jobs (1 KOT + 1 BILL)');

  const kotJob = orderJobs.find((j) => j.jobType === 'KOT');
  const billJob = orderJobs.find((j) => j.jobType === 'BILL');
  assert(kotJob, 'KOT job must be generated');
  assert(billJob, 'BILL job must be generated');
  console.log(`✅ 5. Print jobs generated: KOT=${kotJob.id}, BILL=${billJob.id}`);

  // 6. Verify station normalization (Requirement 5)
  // Station must be normalized to 'Chinese Special' for Chinese items and 'Billing Counter' for Bill
  assert.strictEqual(kotJob.station, 'Chinese Special', 'KOT station must be normalized to "Chinese Special"');
  assert.strictEqual(billJob.station, 'Billing Counter', 'Bill station must be normalized to "Billing Counter"');
  assert(Array.isArray(kotJob.stationAliases), 'stationAliases must be provided');
  assert(kotJob.stationAliases?.includes('Chinese Wok Station'), 'stationAliases must include Chinese Wok Station');
  console.log('✅ 6. Station normalization verified: KOT -> "Chinese Special", BILL -> "Billing Counter"');

  // 7. Verify device claiming (Requirement 7)
  const kotClaim = await printService.claimPrintJob(kotJob.id, mozzDeviceId, mozzRestaurantId, mozzBranchId);
  assert.strictEqual(kotClaim.claimed, true, 'KOT job claim must succeed');
  assert.strictEqual(kotClaim.job?.status, 'CLAIMED');

  const billClaim = await printService.claimPrintJob(billJob.id, mozzDeviceId, mozzRestaurantId, mozzBranchId);
  assert.strictEqual(billClaim.claimed, true, 'BILL job claim must succeed');
  assert.strictEqual(billClaim.job?.status, 'CLAIMED');
  console.log('✅ 7. Jobs atomically claimed by paired device win_pos_b27tprul');

  // 8. Update statuses to PRINTING and PRINTED
  await printService.updatePrintJobStatus(kotJob.id, mozzDeviceId, 'PRINTING');
  const kotPrinted = await printService.updatePrintJobStatus(kotJob.id, mozzDeviceId, 'PRINTED', { durationMs: 400 });
  assert.strictEqual(kotPrinted?.status, 'PRINTED');

  await printService.updatePrintJobStatus(billJob.id, mozzDeviceId, 'PRINTING');
  const billPrinted = await printService.updatePrintJobStatus(billJob.id, mozzDeviceId, 'PRINTED', { durationMs: 500 });
  assert.strictEqual(billPrinted?.status, 'PRINTED');
  console.log('✅ 8. Hardware status updated to PRINTED with durations recorded');

  // 9. Verify Print Delivery Audit Trail (Requirement 1 & 2)
  const audit = await printService.getOrderPrintDeliveryAudit(newOrder.id, mozzRestaurantId);
  assert(audit, 'Audit trail must exist for the order');
  assert.strictEqual(audit.orderNumber, newOrder.orderNumber);
  assert.strictEqual(audit.restaurantId, mozzRestaurantId);
  assert.strictEqual(audit.branchId, mozzBranchId);
  assert.strictEqual(audit.kotEligible, true);
  assert.strictEqual(audit.billEligible, true);
  assert(audit.pairedDevice, 'Paired device must be listed in audit');
  assert.strictEqual(audit.pairedDevice?.deviceId, mozzDeviceId);
  assert.strictEqual(audit.pairedDevice?.deviceName, 'Cash Counter POS');
  assert.strictEqual(audit.jobs.length, 2);
  assert.strictEqual(audit.jobs[0].status, 'printed');
  assert.strictEqual(audit.jobs[1].status, 'printed');
  console.log('✅ 9. Complete Print Delivery Audit verified for order');

  console.log('\n🎉 ALL MOZZ GACHIBOWLI PRINT DELIVERY E2E TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runMozzE2ETest().catch((err) => {
  console.error('❌ E2E Test failed:', err);
  process.exit(1);
});
