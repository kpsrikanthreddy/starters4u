import assert from 'assert';
import { handleWhatsAppVerification } from '../server/services/whatsappWebhookService.js';
import handler from '../api/whatsapp/webhook.js';
import { initializeDatabase, inMemoryDb, query, isPostgresRunning } from '../server/db.js';
import { createOrder, updateOrderStatus } from '../server/services/orderService.js';
import { sendOrderFeedback, getFeedbackRequestForOrder } from '../server/services/feedbackService.js';

async function runTests() {
  console.log('🧪 Starting WhatsApp Webhook Verification and Event Tests...\n');

  await initializeDatabase();

  const TEST_TOKEN = 'test_secret_verify_token_98765';
  process.env.WHATSAPP_VERIFY_TOKEN = TEST_TOKEN;

  // Helper mock for res
  function createMockRes() {
    return {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: '' as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      sendStatus(code: number) {
        this.statusCode = code;
        this.body = code === 403 ? 'Forbidden' : String(code);
        return this;
      },
      setHeader(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      },
      send(payload: any) {
        this.body = payload;
        return this;
      },
    };
  }

  // Intercept logs to verify safe logging
  let capturedLogs: string[] = [];
  const originalLog = console.log;
  const originalInfo = console.info;
  const logCapture = (...args: any[]) => {
    capturedLogs.push(args.map(a => String(a)).join(' '));
  };

  try {
    // -------------------------------------------------------------------------
    // Test 1: Successful verification returns HTTP 200 and plain-text challenge
    // -------------------------------------------------------------------------
    console.info = logCapture;
    console.log = logCapture;
    capturedLogs = [];
    const mockRes1 = createMockRes();
    const mockReq1 = {
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=' + TEST_TOKEN,
      query: {
        'hub.mode': 'subscribe',
        'hub.challenge': '1158201444',
        'hub.verify_token': TEST_TOKEN,
      },
    };

    handleWhatsAppVerification(mockReq1, mockRes1);

    assert.strictEqual(mockRes1.statusCode, 200, 'Expected status 200');
    assert.strictEqual(mockRes1.body, '1158201444', 'Expected body to match challenge exactly');
    assert.ok(mockRes1.headers['content-type']?.includes('text/plain'), 'Expected text/plain content type');

    // Check safe logging
    const fullLog = capturedLogs.join('\n');
    assert.ok(fullLog.includes('WhatsApp webhook verification request received'), 'Expected verification log header');
    assert.ok(fullLog.includes('mode=subscribe'), 'Expected mode=subscribe');
    assert.ok(fullLog.includes('tokenMatch=true'), 'Expected tokenMatch=true');
    assert.ok(fullLog.includes('challengePresent=true'), 'Expected challengePresent=true');
    assert.ok(!fullLog.includes(TEST_TOKEN), 'CRITICAL: Must NEVER log the actual verify token');

    console.info = originalInfo;
    console.log = originalLog;
    console.log('✅ Test 1 Passed: Valid GET verification returns HTTP 200, challenge text, and safe logging.');

    // -------------------------------------------------------------------------
    // Test 2: Invalid token returns HTTP 403 Forbidden
    // -------------------------------------------------------------------------
    console.info = logCapture;
    console.log = logCapture;
    capturedLogs = [];
    const mockRes2 = createMockRes();
    const mockReq2 = {
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=WRONG_TOKEN',
      query: {
        'hub.mode': 'subscribe',
        'hub.challenge': '1158201444',
        'hub.verify_token': 'WRONG_TOKEN',
      },
    };

    handleWhatsAppVerification(mockReq2, mockRes2);

    assert.strictEqual(mockRes2.statusCode, 403, 'Expected status 403 for wrong token');
    const log2 = capturedLogs.join('\n');
    assert.ok(log2.includes('tokenMatch=false'), 'Expected tokenMatch=false');
    assert.ok(!log2.includes('WRONG_TOKEN'), 'Must not log wrong token');

    console.info = originalInfo;
    console.log = originalLog;
    console.log('✅ Test 2 Passed: Verification with invalid token returns HTTP 403.');

    // -------------------------------------------------------------------------
    // Test 3: Invalid hub.mode returns HTTP 403 Forbidden
    // -------------------------------------------------------------------------
    const mockRes3 = createMockRes();
    const mockReq3 = {
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=invalid_mode&hub.challenge=1158201444&hub.verify_token=' + TEST_TOKEN,
      query: {
        'hub.mode': 'invalid_mode',
        'hub.challenge': '1158201444',
        'hub.verify_token': TEST_TOKEN,
      },
    };

    handleWhatsAppVerification(mockReq3, mockRes3);
    assert.strictEqual(mockRes3.statusCode, 403, 'Expected status 403 for invalid mode');
    console.log('✅ Test 3 Passed: Verification with non-subscribe mode returns HTTP 403.');

    // -------------------------------------------------------------------------
    // Test 4: Missing challenge returns HTTP 403
    // -------------------------------------------------------------------------
    const mockRes4 = createMockRes();
    const mockReq4 = {
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=' + TEST_TOKEN,
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': TEST_TOKEN,
      },
    };

    handleWhatsAppVerification(mockReq4, mockRes4);
    assert.strictEqual(mockRes4.statusCode, 403, 'Expected status 403 for missing challenge');
    console.log('✅ Test 4 Passed: Verification without challenge returns HTTP 403.');

    // -------------------------------------------------------------------------
    // Test 5: Standalone Vercel Serverless Function (api/whatsapp/webhook.ts)
    // -------------------------------------------------------------------------
    const mockRes5 = createMockRes();
    const mockReq5 = {
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=vercel_challenge_999&hub.verify_token=' + TEST_TOKEN,
      query: {
        'hub.mode': 'subscribe',
        'hub.challenge': 'vercel_challenge_999',
        'hub.verify_token': TEST_TOKEN,
      },
    };

    await handler(mockReq5, mockRes5);
    assert.strictEqual(mockRes5.statusCode, 200, 'Expected status 200 via Vercel handler');
    assert.strictEqual(mockRes5.body, 'vercel_challenge_999', 'Expected challenge body via Vercel handler');
    assert.ok(mockRes5.headers['cache-control']?.includes('no-store'), 'Expected Cache-Control: no-store');
    console.log('✅ Test 5 Passed: Dedicated Vercel Serverless Function responds with 200 and challenge.');

    // -------------------------------------------------------------------------
    // Test 6: POST Webhook Delivery Status Callback
    // -------------------------------------------------------------------------
    const mockRes6 = createMockRes();
    const mockReq6 = {
      method: 'POST',
      url: '/api/whatsapp/webhook',
      headers: {},
      body: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1234567890',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: 'wamid.test_status_123',
                      status: 'delivered',
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    await handler(mockReq6, mockRes6);
    assert.strictEqual(mockRes6.statusCode, 200, 'Expected status 200 for POST status event');
    assert.strictEqual(mockRes6.body, 'EVENT_RECEIVED', 'Expected EVENT_RECEIVED');
    console.log('✅ Test 6 Passed: POST WhatsApp webhook status callback responds with 200 EVENT_RECEIVED.');

    // -------------------------------------------------------------------------
    // Test 7: Real Meta Feedback Webhook Processing (message.type = "button")
    // -------------------------------------------------------------------------
    // 1. Create real order and dispatch feedback template to get outbound wamid
    const testOrder = await createOrder({
      restaurantId: 'a0000000-0000-0000-0000-000000000001',
      branchId: 'b0000000-0000-0000-0000-000000000001',
      orderType: 'delivery',
      entrySource: 'customer_web',
      paymentMethod: 'cod',
      customer: {
        name: 'Venkatesh Rao',
        phone: '9848011223',
        address: 'Hitech City, Hyderabad',
      },
      items: [
        {
          cartItemId: 'c-test-real-1',
          menuItem: {
            id: 'test-item-real',
            name: 'Paneer Tikka Pocket Pizza',
            price: 249,
            category: 'pocket_pizza_veg',
            dietary: 'veg',
            description: 'Delicious pocket pizza',
            inStock: true,
          },
          quantity: 1,
          unitPrice: 249,
          addons: [],
        },
      ],
    });

    await updateOrderStatus(testOrder.id, 'delivered');

    // Mock fetch for WhatsApp template dispatch
    const originalFetch = globalThis.fetch;
    const testOutboundWamid = `wamid.HBgRealOutbound_${Date.now()}`;
    globalThis.fetch = async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes('graph.facebook.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: 'whatsapp',
            messages: [{ id: testOutboundWamid }],
          }),
        } as any;
      }
      return originalFetch(url, opts);
    };

    const sendRes = await sendOrderFeedback(testOrder.id, true);
    assert.strictEqual(sendRes.success, true, 'Feedback template dispatched successfully');
    assert.strictEqual(sendRes.whatsappMessageId, testOutboundWamid, 'Outbound wamid recorded');

    // Verify initial DB state: feedback_rating is NULL
    const initialRecord = await getFeedbackRequestForOrder(testOrder.id);
    assert.strictEqual(initialRecord?.feedback_rating, null, 'Initial feedback_rating is NULL');

    // 2. Simulate REAL Meta Webhook Payload for customer clicking "Good"
    console.info = logCapture;
    console.log = logCapture;
    capturedLogs = [];

    const realMetaButtonPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '918179620607',
                  phone_number_id: '123456789012345',
                },
                contacts: [
                  {
                    profile: { name: 'Venkatesh Rao' },
                    wa_id: '919848011223',
                  },
                ],
                messages: [
                  {
                    context: {
                      from: '918179620607',
                      id: testOutboundWamid, // Outbound wamid matching customer_feedback_requests.whatsapp_message_id
                    },
                    from: '919848011223',
                    id: `wamid.HBgCustomerClick_${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'button',
                    button: {
                      payload: 'Good',
                      text: 'Good',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const mockRes7 = createMockRes();
    const mockReq7 = {
      method: 'POST',
      url: '/api/whatsapp/webhook',
      headers: {},
      body: realMetaButtonPayload,
    };

    await handler(mockReq7, mockRes7);

    assert.strictEqual(mockRes7.statusCode, 200, 'Expected status 200 for real Meta webhook');
    assert.strictEqual(mockRes7.body, 'EVENT_RECEIVED', 'Expected EVENT_RECEIVED');

    // Verify Safe Logs (Requirement 1 & 5)
    const logs7 = capturedLogs.join('\n');
    assert.ok(logs7.includes('REAL WHATSAPP WEBHOOK RECEIVED'), 'Logs contains REAL WHATSAPP WEBHOOK RECEIVED');
    assert.ok(logs7.includes('object=whatsapp_business_account'), 'Logs contains object=whatsapp_business_account');
    assert.ok(logs7.includes('entry count=1'), 'Logs contains entry count=1');
    assert.ok(logs7.includes('change.field=messages'), 'Logs contains change.field=messages');
    assert.ok(logs7.includes('message.type=button'), 'Logs contains message.type=button');
    assert.ok(logs7.includes('button.text=Good'), 'Logs contains button.text=Good');
    assert.ok(logs7.includes('feedbackButtonReceived=true'), 'Logs contains feedbackButtonReceived=true');
    assert.ok(logs7.includes('rating=GOOD'), 'Logs contains rating=GOOD');
    assert.ok(logs7.includes('contextMessageIdPresent=true'), 'Logs contains contextMessageIdPresent=true');
    assert.ok(logs7.includes('feedbackRequestFound=true'), 'Logs contains feedbackRequestFound=true');
    assert.ok(logs7.includes('databaseUpdateCount=1'), 'Logs contains databaseUpdateCount=1');

    // Verify DB state after processing
    const updatedRecord = await getFeedbackRequestForOrder(testOrder.id);
    assert.strictEqual(updatedRecord?.feedback_rating, 'GOOD', 'feedback_rating updated to GOOD');
    assert.strictEqual(updatedRecord?.status, 'RESPONDED', 'status updated to RESPONDED');
    assert.ok(Boolean(updatedRecord?.feedback_received_at), 'feedback_received_at timestamp set');

    console.info = originalInfo;
    console.log = originalLog;
    console.log('✅ Test 7 Passed: Real Meta Quick Reply (button) webhook atomically updates feedback_rating to GOOD and logs safe diagnostics.');

    // -------------------------------------------------------------------------
    // Test 8: Duplicate Click Handling (Customer later clicks Average)
    // -------------------------------------------------------------------------
    console.info = logCapture;
    console.log = logCapture;
    capturedLogs = [];

    const duplicateClickPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  {
                    context: {
                      from: '918179620607',
                      id: testOutboundWamid,
                    },
                    from: '919848011223',
                    id: `wamid.HBgDuplicateClick_${Date.now()}`,
                    type: 'button',
                    button: {
                      payload: 'Average',
                      text: 'Average',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const mockRes8 = createMockRes();
    const mockReq8 = {
      method: 'POST',
      url: '/api/whatsapp/webhook',
      headers: {},
      body: duplicateClickPayload,
    };

    await handler(mockReq8, mockRes8);

    assert.strictEqual(mockRes8.statusCode, 200, 'Expected status 200');
    const logs8 = capturedLogs.join('\n');
    assert.ok(logs8.includes('feedbackButtonReceived=true'), 'Logs contains feedbackButtonReceived=true');
    assert.ok(logs8.includes('rating=AVERAGE'), 'Logs contains rating=AVERAGE');
    assert.ok(logs8.includes('feedbackRequestFound=true'), 'Logs contains feedbackRequestFound=true');
    assert.ok(logs8.includes('databaseUpdateCount=0'), 'Logs contains databaseUpdateCount=0 (atomic no-op)');

    // Verify rating remains GOOD (first response wins)
    const preservedRecord = await getFeedbackRequestForOrder(testOrder.id);
    assert.strictEqual(preservedRecord?.feedback_rating, 'GOOD', 'Existing rating GOOD was preserved, not overwritten by AVERAGE');

    console.info = originalInfo;
    console.log = originalLog;
    console.log('✅ Test 8 Passed: Duplicate click returns databaseUpdateCount=0 and preserves original GOOD rating.');

    // -------------------------------------------------------------------------
    // Test 9: Real Meta Interactive format (message.type = "interactive")
    // -------------------------------------------------------------------------
    // Create another order for interactive BAD reply test
    const testOrder2 = await createOrder({
      restaurantId: 'a0000000-0000-0000-0000-000000000001',
      branchId: 'b0000000-0000-0000-0000-000000000001',
      orderType: 'takeaway',
      entrySource: 'customer_web',
      paymentMethod: 'upi',
      customer: {
        name: 'Anita Sharma',
        phone: '9848099887',
      },
      items: [
        {
          cartItemId: 'c-test-real-2',
          menuItem: {
            id: 'test-item-real-2',
            name: 'Cheese Corn Maggie',
            price: 129,
            category: 'maggie',
            dietary: 'veg',
            description: 'Hot maggie noodles',
            inStock: true,
          },
          quantity: 1,
          unitPrice: 129,
          addons: [],
        },
      ],
    });

    const testOutboundWamid2 = `wamid.HBgRealOutbound2_${Date.now()}`;
    globalThis.fetch = async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes('graph.facebook.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: 'whatsapp',
            messages: [{ id: testOutboundWamid2 }],
          }),
        } as any;
      }
      return originalFetch(url, opts);
    };

    await updateOrderStatus(testOrder2.id, 'delivered');
    await sendOrderFeedback(testOrder2.id, true);

    console.info = logCapture;
    console.log = logCapture;
    capturedLogs = [];

    const interactiveBadPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  {
                    context: {
                      id: testOutboundWamid2,
                    },
                    from: '919848099887',
                    id: `wamid.HBgInteractiveClick_${Date.now()}`,
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'bad',
                        title: 'Bad',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const mockRes9 = createMockRes();
    const mockReq9 = {
      method: 'POST',
      url: '/api/whatsapp/webhook',
      headers: {},
      body: interactiveBadPayload,
    };

    await handler(mockReq9, mockRes9);
    assert.strictEqual(mockRes9.statusCode, 200);

    const logs9 = capturedLogs.join('\n');
    assert.ok(logs9.includes('message.type=interactive'), 'Logs contains message.type=interactive');
    assert.ok(logs9.includes('interactive.button_reply.id=bad'), 'Logs contains interactive.button_reply.id=bad');
    assert.ok(logs9.includes('interactive.button_reply.title=Bad'), 'Logs contains interactive.button_reply.title=Bad');
    assert.ok(logs9.includes('rating=BAD'), 'Normalized interactive reply to BAD');
    assert.ok(logs9.includes('databaseUpdateCount=1'), 'Database update count is 1');

    const updatedRecord2 = await getFeedbackRequestForOrder(testOrder2.id);
    assert.strictEqual(updatedRecord2?.feedback_rating, 'BAD', 'Saved feedback_rating is BAD');

    console.info = originalInfo;
    console.log = originalLog;
    console.log('✅ Test 9 Passed: Real Meta Interactive button_reply payload correctly processed and saved as BAD.');

    // -------------------------------------------------------------------------
    // Test 10: Unknown context wamid returns 200, logs reason, databaseUpdateCount=0
    // -------------------------------------------------------------------------
    console.info = logCapture;
    console.log = logCapture;
    capturedLogs = [];

    const unresolvablePayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  {
                    context: {
                      id: 'wamid.HBgUnknownContextId_99999999',
                    },
                    from: '919848099887',
                    id: `wamid.HBgClick_${Date.now()}`,
                    type: 'button',
                    button: {
                      text: 'Good',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const mockRes10 = createMockRes();
    const mockReq10 = {
      method: 'POST',
      url: '/api/whatsapp/webhook',
      headers: {},
      body: unresolvablePayload,
    };

    await handler(mockReq10, mockRes10);
    assert.strictEqual(mockRes10.statusCode, 200, 'Returns HTTP 200 even when request unresolvable');

    const logs10 = capturedLogs.join('\n');
    assert.ok(logs10.includes('feedbackRequestFound=false'), 'Logs feedbackRequestFound=false');
    assert.ok(logs10.includes('databaseUpdateCount=0'), 'Logs databaseUpdateCount=0');

    console.info = originalInfo;
    console.log = originalLog;
    console.log('✅ Test 10 Passed: Unresolvable context wamid safely returns HTTP 200 and logs reason.');

    // Restore fetch
    globalThis.fetch = originalFetch;

  } finally {
    console.info = originalInfo;
    console.log = originalLog;
  }

  console.log('\n🎉 ALL 10 WHATSAPP WEBHOOK TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
