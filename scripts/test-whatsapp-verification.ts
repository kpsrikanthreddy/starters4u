import assert from 'assert';
import { handleWhatsAppVerification, handleWhatsAppWebhookEvent } from '../server/services/whatsappWebhookService.js';
import handler from '../api/whatsapp/webhook.js';

async function runTests() {
  console.log('🧪 Starting WhatsApp Webhook Verification and Event Tests...\n');

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
  console.info = logCapture;
  console.log = logCapture;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Successful verification returns HTTP 200 and plain-text challenge
    // -------------------------------------------------------------------------
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

    console.warn = originalLog;
    originalLog('✅ Test 1 Passed: Valid GET verification returns HTTP 200, challenge text, and safe logging.');

    // -------------------------------------------------------------------------
    // Test 2: Invalid token returns HTTP 403 Forbidden
    // -------------------------------------------------------------------------
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
    originalLog('✅ Test 2 Passed: Verification with invalid token returns HTTP 403.');

    // -------------------------------------------------------------------------
    // Test 3: Invalid hub.mode returns HTTP 403 Forbidden
    // -------------------------------------------------------------------------
    capturedLogs = [];
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
    originalLog('✅ Test 3 Passed: Verification with non-subscribe mode returns HTTP 403.');

    // -------------------------------------------------------------------------
    // Test 4: Missing challenge returns HTTP 403
    // -------------------------------------------------------------------------
    capturedLogs = [];
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
    const log4 = capturedLogs.join('\n');
    assert.ok(log4.includes('challengePresent=false'), 'Expected challengePresent=false');
    originalLog('✅ Test 4 Passed: Verification without challenge returns HTTP 403.');

    // -------------------------------------------------------------------------
    // Test 5: Standalone Vercel Serverless Function (api/whatsapp/webhook.ts)
    // -------------------------------------------------------------------------
    capturedLogs = [];
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
    originalLog('✅ Test 5 Passed: Dedicated Vercel Serverless Function responds with 200 and challenge.');

    // -------------------------------------------------------------------------
    // Test 6: POST Webhook Event Processing through handler
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
            changes: [
              {
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
    assert.strictEqual(mockRes6.statusCode, 200, 'Expected status 200 for POST events');
    assert.strictEqual(mockRes6.body, 'EVENT_RECEIVED', 'Expected EVENT_RECEIVED');
    originalLog('✅ Test 6 Passed: POST WhatsApp webhook event handler responds with 200 EVENT_RECEIVED.');

  } finally {
    console.info = originalInfo;
    console.log = originalLog;
  }

  console.log('\n🎉 ALL WHATSAPP WEBHOOK TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
