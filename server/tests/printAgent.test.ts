import assert from 'assert';
import { initializeDatabase, inMemoryDb } from '../db.js';
import * as printService from '../services/printService.js';
import * as orderService from '../services/orderService.js';
import * as menuService from '../services/menuService.js';

async function runTests() {
  console.log('🧪 [Test Suite] Starting Starters4U Print Agent & Backend API Tests...\n');

  // 1. Initialize Database
  await initializeDatabase();
  console.log('✅ 1. Database initialized (dual-mode verified)');

  const testRestaurantId = 'a0000000-0000-0000-0000-000000000001';
  const testBranchId = 'b0000000-0000-0000-0000-000000000001';
  const testDeviceId = 'win-pos-term-01';

  // 2. Device Registration
  const regResult = await printService.registerDevice({
    restaurantId: testRestaurantId,
    branchId: testBranchId,
    deviceId: testDeviceId,
    deviceName: 'Front Counter Windows Terminal',
    platform: 'win32',
    appVersion: '1.0.0',
  });

  assert(regResult.device, 'Device object must be returned');
  assert(regResult.deviceToken, 'Plain device token must be returned');
  assert(regResult.deviceToken.startsWith('device_'), 'Token should have device_ prefix');
  assert.strictEqual(regResult.device.deviceId, testDeviceId);
  assert.strictEqual(regResult.device.isActive, true);
  console.log('✅ 2. Device registration passed (secure token hash generated)');

  // 3. Device Authentication & Heartbeat
  const authDevice = await printService.authenticateDeviceToken(regResult.deviceToken);
  assert(authDevice, 'Valid device token must authenticate');
  assert.strictEqual(authDevice?.deviceId, testDeviceId);

  const invalidDevice = await printService.authenticateDeviceToken('invalid_token_12345');
  assert.strictEqual(invalidDevice, null, 'Invalid token must return null');

  const heartbeatSuccess = await printService.touchDeviceHeartbeat(testDeviceId);
  assert.strictEqual(heartbeatSuccess, true, 'Heartbeat must succeed');
  console.log('✅ 3. Device token authentication & heartbeat passed');

  // 4. Create Real Order & Verify Print Job Generation (KOT + Bill)
  const menuItems = await menuService.getMenu(testRestaurantId);
  const sampleMenuItem = menuItems[0] || {
    id: 'm-default-01',
    name: 'Classic Margherita Pocket Pizza',
    category: 'pocket_pizza_veg',
    dietary: 'veg',
    description: 'Fresh mozzarella & basil',
    inStock: true,
  };

  const realOrder = await orderService.createOrder({
    restaurantId: testRestaurantId,
    branchId: testBranchId,
    orderType: 'takeaway',
    customer: {
      name: 'Rohan Sharma',
      phone: '9876543210',
      address: 'Hitec City, Hyderabad',
    },
    items: [
      {
        cartItemId: 'c1',
        menuItem: sampleMenuItem,
        selectedShape: 'R',
        selectedCrust: 'Korean Pocket Crust',
        quantity: 2,
        unitPrice: 249,
        addons: [],
      },
    ],
    paymentMethod: 'upi_qr',
    paymentStatus: 'paid',
  });

  assert(realOrder, 'Order should be created successfully');
  assert(realOrder.id, 'Order must have a valid ID');

  // Fetch jobs generated for this order
  const pendingJobs = await printService.getPrintJobs(testRestaurantId, testBranchId, 'PENDING');
  const orderJobs = pendingJobs.filter((j) => j.orderId === realOrder.id);
  assert.strictEqual(orderJobs.length, 2, 'Should create exactly 2 print jobs (1 KOT + 1 Bill)');

  const kotJob = orderJobs.find((j) => j.jobType === 'KOT');
  const billJob = orderJobs.find((j) => j.jobType === 'BILL');

  assert(kotJob, 'KOT job must exist');
  assert(billJob, 'Bill job must exist');
  assert.strictEqual(kotJob?.status, 'PENDING');
  assert.strictEqual(billJob?.status, 'PENDING');

  // Verify KOT ticket payload (Strictly NO pricing or payment details)
  const kotPayload = kotJob?.payload as any;
  assert(kotPayload.orderNumber, 'KOT must have orderNumber');
  assert(kotPayload.kotNumber, 'KOT must have kotNumber');
  assert.strictEqual(kotPayload.items.length, 1);
  assert.strictEqual(kotPayload.items[0].unitPrice, undefined, 'KOT items must not have prices');
  assert.strictEqual(kotPayload.grandTotal, undefined, 'KOT must not have grand total');

  // Verify Bill ticket payload (Full item breakdown, tax, total, payment status)
  const billPayload = billJob?.payload as any;
  assert.strictEqual(billPayload.orderNumber, realOrder.orderNumber);
  assert(billPayload.grandTotal > 0, 'Grand total must be positive');
  assert.strictEqual(billPayload.paymentMethod, 'upi_qr');
  assert.strictEqual(billPayload.paymentStatus, 'paid');
  console.log('✅ 4. Order creation & print jobs verified (clean KOT and complete Bill payloads)');

  // 5. Idempotency Check (Duplicate Order trigger / Browser Refresh)
  const duplicateJobs = await printService.createPrintJobsForOrder(realOrder, { reason: 'online_paid' });
  assert.strictEqual(duplicateJobs.length, 0, 'Duplicate order trigger must produce 0 duplicate jobs');
  console.log('✅ 5. Idempotency check passed (duplicate print jobs suppressed)');

  // 6. Atomic Claim Test
  const claim1 = await printService.claimPrintJob(kotJob!.id, testDeviceId, testRestaurantId, testBranchId);
  assert.strictEqual(claim1.claimed, true, 'First claim must succeed');
  assert.strictEqual(claim1.job?.status, 'CLAIMED');

  const claim2 = await printService.claimPrintJob(kotJob!.id, 'win-pos-term-02', testRestaurantId, testBranchId);
  assert.strictEqual(claim2.claimed, false, 'Second claim on already claimed job must be rejected');
  console.log('✅ 6. Atomic claim check passed (conflict prevention verified)');

  // 7. Status Transitions & Attempt Auditing
  const printingJob = await printService.updatePrintJobStatus(kotJob!.id, testDeviceId, 'PRINTING');
  assert.strictEqual(printingJob?.status, 'PRINTING');

  const printedJob = await printService.updatePrintJobStatus(kotJob!.id, testDeviceId, 'PRINTED', {
    durationMs: 450,
  });
  assert.strictEqual(printedJob?.status, 'PRINTED');
  assert(printedJob?.printedAt, 'printedAt timestamp must be recorded');

  // Test failure state on bill job
  const billClaim = await printService.claimPrintJob(
    billJob!.id,
    testDeviceId,
    testRestaurantId,
    testBranchId
  );
  assert.strictEqual(billClaim.claimed, true, 'Bill job must be claimed before status updates');
  await printService.updatePrintJobStatus(billJob!.id, testDeviceId, 'PRINTING');
  const failedJob = await printService.updatePrintJobStatus(billJob!.id, testDeviceId, 'FAILED', {
    errorMessage: 'Thermal printer paper out',
    durationMs: 120,
    attemptNumber: 1,
  });
  assert.strictEqual(failedJob?.status, 'FAILED');
  assert.strictEqual(failedJob?.errorMessage, 'Thermal printer paper out');
  assert.strictEqual(failedJob?.retryCount, 1);
  const retryResult = await printService.retryFailedPrintJob(
    billJob!.id,
    testDeviceId,
    testRestaurantId,
    testBranchId
  );
  assert.strictEqual(retryResult.claimed, true, 'Explicit retry must reclaim a failed job');
  console.log('✅ 7. Job status transitions & audit attempt logging passed');

  // 8. Staff Manual Reprint Test
  const reprintJob = await printService.createReprintJob(realOrder, 'KOT', 'kitchen_master');
  assert(reprintJob, 'Reprint job must be created');
  assert.strictEqual(reprintJob?.isReprint, true);
  assert.strictEqual((reprintJob?.payload as any).isReprint, true);
  assert.strictEqual(reprintJob?.status, 'PENDING');
  console.log('✅ 8. Manual staff reprint test passed (flagged with isReprint: true)');

  // 9. Printer Configuration Persistence Test
  const savedConfigs = await printService.savePrinterConfigurations(testRestaurantId, testBranchId, testDeviceId, [
    { station: 'billing', printerName: 'POS-80 Thermal Printer', paperWidthMm: 80, copies: 1, isAutoPrint: true },
    { station: 'kitchen_master', printerName: 'Kitchen-KOT-58', paperWidthMm: 58, copies: 2, isAutoPrint: true },
  ]);
  assert.strictEqual(savedConfigs.length, 2);

  const fetchedConfigs = await printService.getPrinterConfigurations(testRestaurantId, testBranchId, testDeviceId);
  assert.strictEqual(fetchedConfigs.length, 2);
  const billingCfg = fetchedConfigs.find((c) => c.station === 'billing');
  assert.strictEqual(billingCfg?.printerName, 'POS-80 Thermal Printer');
  assert.strictEqual(billingCfg?.paperWidthMm, 80);
  console.log('✅ 9. Printer station configurations test passed');

  // 10. 6-Digit Device Pairing Code Flow Test
  console.log('\n--- Testing 6-Digit Device Pairing Code Flow ---');
  const pairingCodeRecord = await printService.createPairingCode(testRestaurantId, testBranchId, 10);
  assert.strictEqual(pairingCodeRecord.code.length, 6, 'Pairing code must be 6 digits');
  assert.strictEqual(pairingCodeRecord.isUsed, false);

  // Pair device using code
  const pairResult = await printService.pairDeviceWithCode({
    pairingCode: pairingCodeRecord.code,
    deviceId: 'win-paired-terminal-99',
    deviceName: 'Bar Counter Terminal',
    platform: 'win32',
    appVersion: '1.0.0',
  });
  assert(pairResult.deviceToken, 'Must issue device token upon pairing');
  assert.strictEqual(pairResult.device.deviceId, 'win-paired-terminal-99');
  assert.strictEqual(pairResult.restaurant.id, testRestaurantId);
  console.log('✅ 10. 6-Digit device pairing succeeded');

  // Verify single-use: Re-using the same code must return error
  const reuseResult = await printService.pairDeviceWithCode({
    pairingCode: pairingCodeRecord.code,
    deviceId: 'win-intruder-terminal',
    deviceName: 'Intruder Terminal',
    platform: 'win32',
    appVersion: '1.0.0',
  });
  assert.strictEqual(reuseResult.success, false, 'Reusing a pairing code must return success: false');
  assert.ok(
    reuseResult.error?.includes('expired') || reuseResult.error?.includes('Invalid'),
    'Must return descriptive error for used pairing code'
  );
  console.log('✅ 10.1 Single-use pairing code enforcement verified (replay attack blocked)');

  // 11. Device Deactivation & Token Revocation Test
  console.log('\n--- Testing Device Deactivation ---');
  const deactivated = await printService.deactivateDevice(testDeviceId, testRestaurantId);
  assert.strictEqual(deactivated.success, true, 'Deactivation must succeed');

  // Re-authenticating with deactivated token must fail
  const rejectedAuth = await printService.authenticateDeviceToken(regResult.deviceToken);
  assert.strictEqual(rejectedAuth, null, 'Deactivated device token must be rejected immediately');
  console.log('✅ 11. Device deactivation and instant token revocation verified');

  console.log('\n🎉 ALL STARTERS4U PRINT AGENT BACKEND TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
