import assert from 'node:assert/strict';
import {
  MAIN_CATEGORIES,
  DEFAULT_SUBCATEGORIES,
} from '../src/data/categoriesAndSeed';
import { ALL_EXPANDED_QUESTIONS } from '../src/data/questions';
import {
  OfflineDatasetSnapshot,
  SnapshotStorageAdapter,
  collectSafeMediaUrls,
  getOfflineDataStatus,
  isSafeMediaUrlForOfflineCache,
  loadActiveOfflineDataset,
  syncOfflineDatasetAtomically,
  validateOfflineDataset,
  verifySnapshotIntegrity,
} from '../src/services/offlineStore';

function createMemoryStorage(): SnapshotStorageAdapter & {
  store: Map<string, OfflineDatasetSnapshot>;
} {
  const store = new Map<string, OfflineDatasetSnapshot>();
  return {
    store,
    async get(key: string) {
      const val = store.get(key);
      return val ? structuredClone(val) : null;
    },
    async set(key: string, value: OfflineDatasetSnapshot) {
      store.set(key, structuredClone(value));
    },
  };
}

async function runTests() {
  console.log('Running Offline Store & PWA Data Integrity Tests...');

  // 1. Validate rejection of empty or invalid datasets
  assert.equal(
    validateOfflineDataset({
      mainCategories: [],
      subcategories: DEFAULT_SUBCATEGORIES,
      questions: ALL_EXPANDED_QUESTIONS,
    }).ok,
    false,
    'Empty mainCategories must fail validation'
  );
  assert.equal(
    validateOfflineDataset({
      mainCategories: MAIN_CATEGORIES,
      subcategories: [],
      questions: ALL_EXPANDED_QUESTIONS,
    }).ok,
    false,
    'Empty subcategories must fail validation'
  );
  assert.equal(
    validateOfflineDataset({
      mainCategories: MAIN_CATEGORIES,
      subcategories: DEFAULT_SUBCATEGORIES,
      questions: [],
    }).ok,
    false,
    'Empty questions must fail validation'
  );

  // 2. Atomic sync with full NIZAL dataset via staging -> active
  const mem = createMemoryStorage();
  const initialStatus = await getOfflineDataStatus(mem);
  assert.equal(initialStatus.ready, false, 'Empty store should not be ready');

  const syncOk = await syncOfflineDatasetAtomically(
    {
      mainCategories: MAIN_CATEGORIES,
      subcategories: DEFAULT_SUBCATEGORIES,
      questions: ALL_EXPANDED_QUESTIONS,
      source: 'builtin',
    },
    { storage: mem, precacheMedia: false }
  );

  assert.equal(syncOk.ok, true, 'Valid full dataset sync must succeed');
  assert.ok(mem.store.has('staging'), 'Staging snapshot must be written first');
  assert.ok(mem.store.has('active'), 'Active snapshot must be promoted');

  const loaded = await loadActiveOfflineDataset(mem);
  assert.ok(loaded, 'Active dataset must load and pass checksum verification');
  assert.equal(loaded.questions.length, ALL_EXPANDED_QUESTIONS.length);
  assert.ok(
    loaded.questions.every((q) => q.authorId === 'offline_snapshot'),
    'Offline snapshot must sanitize sensitive user IDs'
  );

  const readyStatus = await getOfflineDataStatus(mem);
  assert.equal(readyStatus.ready, true);
  assert.equal(readyStatus.questionsCount, ALL_EXPANDED_QUESTIONS.length);

  // 3. Failed/corrupt sync must preserve existing active snapshot untouched
  const failedSync = await syncOfflineDatasetAtomically(
    {
      mainCategories: MAIN_CATEGORIES,
      subcategories: DEFAULT_SUBCATEGORIES,
      questions: [], // invalid empty update
      source: 'firebase',
    },
    { storage: mem, precacheMedia: false }
  );
  assert.equal(failedSync.ok, false, 'Invalid update must fail cleanly');
  const preserved = await loadActiveOfflineDataset(mem);
  assert.ok(preserved, 'Previous active snapshot must remain valid after failed sync');
  assert.equal(preserved.questions.length, ALL_EXPANDED_QUESTIONS.length);

  // 4. Storage write failure during staging must preserve existing active snapshot
  const flakyStorage: SnapshotStorageAdapter = {
    get: mem.get,
    async set(key, value) {
      if (key === 'staging') {
        throw new Error('Simulated quota/write interruption');
      }
      await mem.set(key, value);
    },
  };
  const interruptedSync = await syncOfflineDatasetAtomically(
    {
      mainCategories: MAIN_CATEGORIES,
      subcategories: DEFAULT_SUBCATEGORIES,
      questions: ALL_EXPANDED_QUESTIONS.slice(0, 10),
      source: 'firebase',
    },
    { storage: flakyStorage, precacheMedia: false }
  );
  assert.equal(interruptedSync.ok, false, 'Interrupted staging must fail safely');
  const afterInterruption = await loadActiveOfflineDataset(mem);
  assert.ok(afterInterruption);
  assert.equal(
    afterInterruption.questions.length,
    ALL_EXPANDED_QUESTIONS.length,
    'Active snapshot must not be overwritten when staging fails'
  );

  // 5. Checksum tampering detection
  const tampered = structuredClone(afterInterruption);
  tampered.questions[0].questionText = 'سؤال تم تعديله';
  tampered.questions[0].id = 'tampered_id';
  assert.equal(
    verifySnapshotIntegrity(tampered),
    false,
    'Tampered snapshot must fail integrity check'
  );

  // 6. Media URL security filter (no Auth/Firestore/API endpoints allowed in offline cache)
  assert.equal(
    isSafeMediaUrlForOfflineCache('https://identitytoolkit.googleapis.com/v1/accounts'),
    false
  );
  assert.equal(
    isSafeMediaUrlForOfflineCache('https://securetoken.googleapis.com/v1/token'),
    false
  );
  assert.equal(
    isSafeMediaUrlForOfflineCache('https://firestore.googleapis.com/v1/projects/x'),
    false
  );
  assert.equal(isSafeMediaUrlForOfflineCache('/api/secret'), false);
  assert.equal(
    isSafeMediaUrlForOfflineCache(
      'https://firebasestorage.googleapis.com/v0/b/demo/o/cat.png?alt=media'
    ),
    true
  );

  const collected = collectSafeMediaUrls({
    mainCategories: [
      {
        ...MAIN_CATEGORIES[0],
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/m1.png?alt=media',
      },
    ],
    subcategories: [
      {
        ...DEFAULT_SUBCATEGORIES[0],
        imageUrl: 'https://identitytoolkit.googleapis.com/v1/bad-token',
      },
    ],
    questions: [
      {
        ...ALL_EXPANDED_QUESTIONS[0],
        imageUrl: '/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png',
      },
    ],
  });
  assert.deepEqual(collected, [
    'https://firebasestorage.googleapis.com/v0/b/demo/o/m1.png?alt=media',
    '/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png',
  ]);

  console.log('✅ All Offline Store & PWA Data Integrity Tests PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Offline Store test failed:', err);
  process.exit(1);
});
