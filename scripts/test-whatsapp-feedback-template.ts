import { initializeDatabase, query, isPostgresRunning, inMemoryDb } from '../server/db.js';
import { createOrder, updateOrderStatus } from '../server/services/orderService.js';
import {
  sendOrderFeedback,
  getFeedbackRequestForOrder,
  updateFeedbackStatusByMessageId,
  WHATSAPP_APPROVED_FEEDBACK_TEMPLATE,
} from '../server/services/feedbackService.js';

async function runTest() {
  console.log('=============================================================');
  console.log('TESTING WHATSAPP FEEDBACK TEMPLATE: glossylooks_customer_feedback');
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
    WHATSAPP_APPROVED_FEEDBACK_TEMPLATE === 'glossylooks_customer_feedback',
    `Approved template name is 'glossylooks_customer_feedback' (was ${WHATSAPP_APPROVED_FEEDBACK_TEMPLATE})`
  );

  // Test 2: Create a delivered/completed order to test WhatsApp feedback button dispatch
  console.log('\n[2] Order Feedback Dispatch Verification');
  const order = await createOrder({
    restaurantId: 'a0000000-0000-0000-0000-000000000001',
    branchId: 'b0000000-0000-0000-0000-000000000001',
    orderType: 'delivery',
    entrySource: 'customer_web',
    paymentMethod: 'cod',
    customer: {
      name: 'Sunita Rao',
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

  // Trigger feedback dispatch (same method invoked by WhatsApp button in Orders & Kitchen)
  const result = await sendOrderFeedback(order.id, true);
  console.log('Feedback dispatch result:', result);

  assert(result.success === true, 'Feedback dispatch reported success');
  assert(result.status === 'SENT', `Initial status is 'SENT' (not DELIVERED): received '${result.status}'`);
  assert(result.templateName === 'glossylooks_customer_feedback', `templateName in result is 'glossylooks_customer_feedback'`);
  assert(Boolean(result.whatsappMessageId), `whatsappMessageId was returned: ${result.whatsappMessageId}`);
  assert(Boolean(result.sentAt), `sentAt timestamp was returned: ${result.sentAt}`);

  // Query record from DB / inMemory
  const record = await getFeedbackRequestForOrder(order.id);
  assert(Boolean(record), 'Feedback request record found for order');
  assert(record!.template_name === 'glossylooks_customer_feedback', `Stored template_name is 'glossylooks_customer_feedback' (was '${record?.template_name}')`);
  assert(record!.status === 'SENT', `Stored status is 'SENT': received '${record?.status}'`);
  assert(record!.whatsapp_message_id === result.whatsappMessageId, 'Stored whatsapp_message_id matches returned wamid');
  assert(Boolean(record!.sent_at), 'Stored sent_at has timestamp');

  // Test 3: Raw PostgreSQL Row Verification (if Postgres running)
  if (isPostgresRunning()) {
    console.log('\n[3] PostgreSQL Database Verification');
    const res = await query(
      `SELECT template_name, status, whatsapp_message_id, sent_at
       FROM customer_feedback_requests WHERE order_id = $1`,
      [order.id]
    );
    assert(res.rows.length === 1, 'Queried customer_feedback_requests from PostgreSQL');
    const pgRow = res.rows[0];
    assert(pgRow.template_name === 'glossylooks_customer_feedback', `PG row template_name is 'glossylooks_customer_feedback'`);
    assert(pgRow.status === 'SENT', `PG row status is 'SENT'`);
    assert(pgRow.whatsapp_message_id === result.whatsappMessageId, `PG row whatsapp_message_id matches`);
    assert(Boolean(pgRow.sent_at), `PG row sent_at is populated`);
  }

  // Test 4: Webhook Status Transitions (SENT -> DELIVERED -> READ)
  console.log('\n[4] Webhook Delivery Status Lifecycle Verification');
  const wamid = result.whatsappMessageId!;

  // 4a. Meta webhook delivers status 'delivered'
  const deliveredRec = await updateFeedbackStatusByMessageId(wamid, 'DELIVERED');
  assert(deliveredRec?.status === 'DELIVERED', `Webhook transitioned status to 'DELIVERED': ${deliveredRec?.status}`);

  // 4b. Meta webhook delivers status 'read'
  const readRec = await updateFeedbackStatusByMessageId(wamid, 'READ');
  assert(readRec?.status === 'READ', `Webhook transitioned status to 'READ': ${readRec?.status}`);

  // 4c. Verify record updated in DB
  const finalRecord = await getFeedbackRequestForOrder(order.id);
  assert(finalRecord?.status === 'READ', `Final queried record status is 'READ': ${finalRecord?.status}`);
  assert(finalRecord?.template_name === 'glossylooks_customer_feedback', `Final template_name is still 'glossylooks_customer_feedback'`);

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
