import { initializeDatabase, query, isPostgresRunning, inMemoryDb } from '../server/db.js';
import { createOrder, updateOrderStatus } from '../server/services/orderService.js';
import {
  sendOrderFeedback,
  getFeedbackRequestForOrder,
  updateFeedbackStatusByMessageId,
  processCustomerFeedbackResponse,
  WHATSAPP_APPROVED_FEEDBACK_TEMPLATE,
} from '../server/services/feedbackService.js';

async function runTest() {
  console.log('=============================================================');
  console.log('TESTING WHATSAPP FEEDBACK TEMPLATE: starters4u_order_feedback');
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

  // Test 1: Constant template name
  console.log('\n[1] Template Name Validation');
  assert(
    WHATSAPP_APPROVED_FEEDBACK_TEMPLATE === 'starters4u_order_feedback',
    `Approved template name is 'starters4u_order_feedback' (was ${WHATSAPP_APPROVED_FEEDBACK_TEMPLATE})`
  );

  // Test 2: Create a delivered/completed order to test WhatsApp feedback button dispatch
  console.log('\n[2] Order Feedback Dispatch Verification (Simulating Meta acceptance)');
  const order = await createOrder({
    restaurantId: 'a0000000-0000-0000-0000-000000000001',
    branchId: 'b0000000-0000-0000-0000-000000000001',
    orderType: 'delivery',
    entrySource: 'customer_web',
    paymentMethod: 'cod',
    customer: {
      name: 'Srikanth Reddy',
      phone: '9848022334',
      address: 'Road No 36, Jubilee Hills, Hyderabad',
      latitude: 17.4319,
      longitude: 78.4073,
    },
    items: [
      {
        cartItemId: 'c-test-1',
        menuItem: {
          id: 'test-item-1',
          name: 'Classic Veg Margherita',
          price: 199,
          category: 'pocket_pizza_veg',
          dietary: 'veg',
          description: '',
          inStock: true,
        },
        unitPrice: 199,
        quantity: 1,
        addons: [],
      },
    ],
  });

  assert(Boolean(order?.id), 'Order created successfully');

  // Mark order as DELIVERED so it is eligible for customer feedback
  await updateOrderStatus(order.id, 'delivered');

  // Mock fetch to simulate Meta Cloud API returning accepted wamid
  const originalFetch = globalThis.fetch;
  const mockWamid = `wamid.HBg${Date.now()}TEST`;
  globalThis.fetch = async (url: any, opts: any) => {
    const urlStr = String(url);
    if (urlStr.includes('graph.facebook.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '919848022334', wa_id: '919848022334' }],
          messages: [{ id: mockWamid }],
        }),
      } as any;
    }
    return originalFetch(url, opts);
  };

  // Trigger feedback dispatch (same method invoked by WhatsApp button in Orders & Kitchen)
  const result = await sendOrderFeedback(order.id, true);
  console.log('Feedback dispatch result:', result);

  assert(result.success === true, 'Feedback dispatch reported success');
  assert(result.status === 'SENT', `Initial status is 'SENT' (not DELIVERED): received '${result.status}'`);
  assert(result.templateName === 'starters4u_order_feedback', `templateName in result is 'starters4u_order_feedback'`);
  assert(result.whatsappMessageId === mockWamid, `whatsappMessageId was returned: ${result.whatsappMessageId}`);
  assert(Boolean(result.sentAt), `sentAt timestamp was returned: ${result.sentAt}`);

  // Query record from DB / inMemory
  const record = await getFeedbackRequestForOrder(order.id);
  assert(Boolean(record), 'Feedback request record found for order');
  assert(record!.template_name === 'starters4u_order_feedback', `Stored template_name is 'starters4u_order_feedback' (was '${record?.template_name}')`);
  assert(record!.status === 'SENT', `Stored status is 'SENT': received '${record?.status}'`);
  assert(record!.whatsapp_message_id === mockWamid, 'Stored whatsapp_message_id matches returned wamid');
  assert(Boolean(record!.sent_at), 'Stored sent_at has timestamp');

  // Test 3: Raw PostgreSQL Row Verification (if Postgres running)
  if (isPostgresRunning()) {
    console.log('\n[3] PostgreSQL Database Verification');
    const res = await query(
      `SELECT template_name, status, whatsapp_message_id, sent_at, feedback_rating
       FROM customer_feedback_requests WHERE order_id = $1`,
      [order.id]
    );
    assert(res.rows.length === 1, 'Queried customer_feedback_requests from PostgreSQL');
    const pgRow = res.rows[0];
    assert(pgRow.template_name === 'starters4u_order_feedback', `PG row template_name is 'starters4u_order_feedback'`);
    assert(pgRow.status === 'SENT', `PG row status is 'SENT'`);
    assert(pgRow.whatsapp_message_id === mockWamid, `PG row whatsapp_message_id matches mockWamid`);
    assert(Boolean(pgRow.sent_at), `PG row sent_at is populated`);
    assert(pgRow.feedback_rating === null, `Initial feedback_rating is NULL`);
  }

  // Test 4: Webhook Status Transitions (SENT -> DELIVERED -> READ)
  console.log('\n[4] Webhook Delivery Status Lifecycle Verification');

  // 4a. Meta webhook delivers status 'delivered'
  const deliveredRec = await updateFeedbackStatusByMessageId(mockWamid, 'DELIVERED');
  assert(deliveredRec?.status === 'DELIVERED', `Webhook transitioned status to 'DELIVERED': ${deliveredRec?.status}`);

  // 4b. Meta webhook delivers status 'read'
  const readRec = await updateFeedbackStatusByMessageId(mockWamid, 'READ');
  assert(readRec?.status === 'READ', `Webhook transitioned status to 'READ': ${readRec?.status}`);

  // Test 5: Customer Quick-Reply Response (⭐ Good button click)
  console.log('\n[5] Customer Feedback Reply Processing & Atomic One-Response-Only Logic');
  const reply1 = await processCustomerFeedbackResponse({
    replyMessageId: `wamid.reply_${Date.now()}_1`,
    replyContextWamid: mockWamid,
    fromPhone: '919848022334',
    buttonText: '⭐ Good',
    buttonPayload: 'GOOD',
  });

  assert(reply1.success === true, 'First feedback response accepted');
  assert(reply1.accepted === true, 'First feedback marked accepted');
  assert(reply1.rating === 'GOOD', `Rating parsed as 'GOOD': received ${reply1.rating}`);

  // Verify DB state after first rating
  const respondedRecord = await getFeedbackRequestForOrder(order.id);
  assert(respondedRecord?.status === 'RESPONDED', `Status updated to 'RESPONDED': received ${respondedRecord?.status}`);
  assert(respondedRecord?.feedback_rating === 'GOOD', `Stored feedback_rating is 'GOOD': received ${respondedRecord?.feedback_rating}`);
  assert(Boolean(respondedRecord?.feedback_received_at), 'feedback_received_at timestamp stored');

  // Test 6: Duplicate Click Handling (Customer later clicks 😐 Average or 😞 Bad)
  console.log('\n[6] Duplicate Click Prevention (Rating Must Not Be Overwritten)');
  const reply2 = await processCustomerFeedbackResponse({
    replyMessageId: `wamid.reply_${Date.now()}_2`,
    replyContextWamid: mockWamid,
    fromPhone: '919848022334',
    buttonText: '😐 Average',
    buttonPayload: 'AVERAGE',
  });

  assert(reply2.accepted === false, 'Duplicate rating click was NOT accepted');
  assert(reply2.alreadyResponded === true, 'Marked as alreadyResponded');

  // Verify DB state did NOT change
  const recheckedRecord = await getFeedbackRequestForOrder(order.id);
  assert(recheckedRecord?.feedback_rating === 'GOOD', `Saved rating remains 'GOOD' (did not overwrite with AVERAGE): received ${recheckedRecord?.feedback_rating}`);
  assert(recheckedRecord?.status === 'RESPONDED', `Status remains 'RESPONDED'`);

  // Restore fetch
  globalThis.fetch = originalFetch;

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
  console.error('Fatal test error:', err);
  process.exit(1);
});
