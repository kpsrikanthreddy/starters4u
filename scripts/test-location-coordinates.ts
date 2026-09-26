import fs from 'fs';
import path from 'path';
import { BUSINESS_INFO, getRestaurantSchema } from '../src/config/businessInfo';
import { MOZZ_RESTAURANT_LOCATION } from '../src/components/GoogleMapsLiveTracker';

let passes = 0;
let failures = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    passes++;
    console.log(`  ✅ [PASS] ${description}`);
  } else {
    failures++;
    console.error(`  ❌ [FAIL] ${description}`);
  }
}

async function runLocationVerificationTests() {
  console.log('📍 [Location Verification Suite] Verifying MOZZ Restaurant Coordinates...\n');

  // 1. Centralized Business Configuration in businessInfo.ts
  console.log('1. Checking Centralized BUSINESS_INFO in src/config/businessInfo.ts:');
  assert(
    BUSINESS_INFO.restaurantName === 'MOZZ Chinese & Pizzateria',
    `restaurantName is verified: "${BUSINESS_INFO.restaurantName}"`
  );
  assert(
    BUSINESS_INFO.streetAddress === 'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli',
    `streetAddress matches verified address: "${BUSINESS_INFO.streetAddress}"`
  );
  assert(
    BUSINESS_INFO.geo?.latitude === 17.442509,
    `latitude is verified static coordinate: ${BUSINESS_INFO.geo?.latitude} === 17.442509`
  );
  assert(
    BUSINESS_INFO.geo?.longitude === 78.353966,
    `longitude is verified static coordinate: ${BUSINESS_INFO.geo?.longitude} === 78.353966`
  );
  assert(
    BUSINESS_INFO.googleMapsUrl === 'https://maps.app.goo.gl/H9R6Fma2rBVmt3uN9',
    `googleMapsUrl matches verified share URL: "${BUSINESS_INFO.googleMapsUrl}"`
  );
  assert(
    BUSINESS_INFO.googlePlaceId === 'ChIJQ_8-QkKTyzsRcb3W1I0llIM',
    `googlePlaceId matches verified place ID: "${BUSINESS_INFO.googlePlaceId}"`
  );

  // 2. Schema.org Restaurant JSON-LD
  console.log('\n2. Checking Schema.org Restaurant JSON-LD structured data:');
  const restaurantSchema = getRestaurantSchema();
  assert(
    restaurantSchema['@type'] === 'Restaurant',
    'JSON-LD type is Restaurant'
  );
  assert(
    restaurantSchema.address?.streetAddress === 'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli',
    `JSON-LD streetAddress matches verified address: "${restaurantSchema.address?.streetAddress}"`
  );
  assert(
    restaurantSchema.geo?.latitude === 17.442509 && restaurantSchema.geo?.longitude === 78.353966,
    `JSON-LD GeoCoordinates match verified (17.442509, 78.353966)`
  );
  assert(
    restaurantSchema.hasMap === 'https://maps.app.goo.gl/H9R6Fma2rBVmt3uN9',
    `JSON-LD hasMap matches verified URL: "${restaurantSchema.hasMap}"`
  );
  assert(
    restaurantSchema.identifier === 'ChIJQ_8-QkKTyzsRcb3W1I0llIM',
    `JSON-LD identifier matches verified Google Place ID: "${restaurantSchema.identifier}"`
  );

  // 3. Live Order Tracker MOZZ Restaurant Location
  console.log('\n3. Checking Live Order Tracker GoogleMapsLiveTracker.tsx:');
  assert(
    MOZZ_RESTAURANT_LOCATION.lat === 17.442509,
    `MOZZ_RESTAURANT_LOCATION.lat is static 17.442509`
  );
  assert(
    MOZZ_RESTAURANT_LOCATION.lng === 78.353966,
    `MOZZ_RESTAURANT_LOCATION.lng is static 78.353966`
  );
  assert(
    MOZZ_RESTAURANT_LOCATION.placeId === 'ChIJQ_8-QkKTyzsRcb3W1I0llIM',
    `MOZZ_RESTAURANT_LOCATION.placeId matches verified ID`
  );
  assert(
    MOZZ_RESTAURANT_LOCATION.googleMapsUrl === 'https://maps.app.goo.gl/H9R6Fma2rBVmt3uN9',
    `MOZZ_RESTAURANT_LOCATION.googleMapsUrl matches verified share URL`
  );

  // 4. Source code inspection of GoogleMapsLiveTracker.tsx
  const trackerFilePath = path.resolve(process.cwd(), 'src/components/GoogleMapsLiveTracker.tsx');
  const trackerSource = fs.readFileSync(trackerFilePath, 'utf-8');

  assert(
    trackerSource.includes('BUSINESS_INFO.geo'),
    'Tracker imports and reads coordinates from central BUSINESS_INFO'
  );
  assert(
    trackerSource.includes('Restaurant Directions') || trackerSource.includes('Get Directions'),
    'Tracker includes restaurant directions action button'
  );
  assert(
    trackerSource.includes('Live rider location is not currently available. Order progress below reflects updates from the restaurant.') ||
    trackerSource.includes('Real-time GPS rider telemetry is not active'),
    'Tracker honestly informs user that real-time rider GPS telemetry is not active'
  );
  assert(
    !trackerSource.includes('setRiderProgress'),
    'Tracker contains NO simulated rider movement state (setRiderProgress removed)'
  );

  // 5. Scan entire src/ directory for banned placeholder coordinates & placeholders
  console.log('\n4. Scanning src/ directory to ensure NO placeholder coordinates remain:');
  const bannedPatterns = [
    { pattern: '17.440081', desc: 'Old placeholder latitude 17.440081' },
    { pattern: '78.348915', desc: 'Old placeholder longitude 78.348915' },
    { pattern: '17.4485', desc: 'Old placeholder customer latitude 17.4485' },
    { pattern: '78.3582', desc: 'Old placeholder customer longitude 78.3582' },
    { pattern: 'Plot 42, Vinayak Nagar', desc: 'Old placeholder Plot 42 address' },
    { pattern: 'ChIJO3pU05iTyzsRqD0Zl176j-g', desc: 'Old placeholder Place ID ChIJO3pU05iTyzsRqD0Zl176j-g' },
  ];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const bp of bannedPatterns) {
          if (content.includes(bp.pattern)) {
            assert(false, `Found forbidden placeholder "${bp.pattern}" in ${fullPath}`);
          }
        }
      }
    }
  }

  scanDir(path.resolve(process.cwd(), 'src'));
  assert(true, 'Scanned entire src/ directory: Zero placeholder coordinates detected');

  console.log(`\n========================================`);
  if (failures > 0) {
    console.error(`Test Results: ${passes} Passed, ${failures} Issues Encountered`);
    console.log(`========================================\n`);
    process.exit(1);
  } else {
    console.log(`Test Results: All ${passes} Passed Successfully`);
    console.log(`========================================\n`);
  }
}

runLocationVerificationTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
