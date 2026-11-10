import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Question sets
import { ANIME_QUESTIONS } from './questions/anime';
import { FOOTBALL_QUESTIONS } from './questions/football';
import { GAMES_QUESTIONS } from './questions/games';
import { GENERAL_QUESTIONS } from './questions/general';
import { GEOGRAPHY_QUESTIONS } from './questions/geography';
import { RELIGION_QUESTIONS, QuestionTemplate } from './questions/religion';
import { SPORTS_QUESTIONS } from './questions/sports';
import { DEFAULT_SUBCATEGORIES } from '../src/data/categoriesAndSeed';

const firebaseConfig = {
  apiKey: "AIzaSyBBuSda47An2NBc8hZt5vMY8yuYn08hXqo",
  authDomain: "nezal-4ea44.firebaseapp.com",
  projectId: "nezal-4ea44",
  storageBucket: "nezal-4ea44.firebasestorage.app",
  messagingSenderId: "785322306435",
  appId: "1:785322306435:web:3a6793223c10bec37e24b6",
  measurementId: "G-VQEF0TW99L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface SubcategoryMeta {
  id: string;
  name: string;
  mainCategoryId: string;
  mainCategory: string;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

async function run() {
  console.log('--- Starting Question Bank Seeding to Firestore ---');

  // Load subcategories from DEFAULT_SUBCATEGORIES
  let subcategories: SubcategoryMeta[] = DEFAULT_SUBCATEGORIES;
  const dumpPath = path.join(process.cwd(), 'subcategories_dump.json');
  if (fs.existsSync(dumpPath)) {
    try {
      subcategories = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));
    } catch {
      subcategories = DEFAULT_SUBCATEGORIES;
    }
  }
  const normalizedMap = new Map<string, SubcategoryMeta>();
  subcategories.forEach(sub => {
    normalizedMap.set(normalizeName(sub.name), sub);
  });

  console.log(`Loaded ${subcategories.length} subcategories from metadata dump.`);

  // Combine dictionaries
  const allDicts: Record<string, QuestionTemplate[]>[] = [
    ANIME_QUESTIONS,
    FOOTBALL_QUESTIONS,
    GAMES_QUESTIONS,
    GENERAL_QUESTIONS,
    GEOGRAPHY_QUESTIONS,
    RELIGION_QUESTIONS,
    SPORTS_QUESTIONS
  ];

  let totalQuestionsCount = 0;
  const processedQuestions: Array<{
    id: string;
    subcategoryId: string;
    category: string;
    mainCategoryId: string;
    mainCategory: string;
    questionText: string;
    questionType: 'direct';
    difficulty: string;
    points: number;
    options: string[];
    correctAnswer: string;
    explanation: string;
    source: string;
    status: 'pending';
    authorId: string;
    createdAt: string;
    reviewedAt: string;
  }> = [];

  for (const dict of allDicts) {
    for (const [subName, qList] of Object.entries(dict)) {
      const meta = normalizedMap.get(normalizeName(subName));
      if (!meta) {
        console.warn(`WARNING: Could not find subcategory meta for "${subName}"`);
        continue;
      }

      qList.forEach((q, index) => {
        totalQuestionsCount++;
        const docId = `q-${meta.id}-${q.points}-${index + 1}`;
        processedQuestions.push({
          id: docId,
          subcategoryId: meta.id,
          category: meta.name,
          mainCategoryId: meta.mainCategoryId,
          mainCategory: meta.mainCategory,
          questionText: q.questionText,
          questionType: 'direct',
          difficulty: q.difficulty,
          points: q.points,
          options: [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          source: q.source || 'بنك أسئلة نِزال المعتمد',
          status: 'pending',
          authorId: 'system',
          createdAt: new Date().toISOString(),
          reviewedAt: ''
        });
      });
    }
  }

  console.log(`Prepared ${processedQuestions.length} direct questions for insertion.`);

  // Check existing questions in Firestore
  const existingSnap = await getDocs(collection(db, 'questions'));
  console.log(`Existing questions in Firestore before seeding: ${existingSnap.size}`);

  const CHUNK_SIZE = 350;
  let batch = writeBatch(db);
  let batchCount = 0;
  let totalSaved = 0;

  for (const item of processedQuestions) {
    const docRef = doc(db, 'questions', item.id);
    batch.set(docRef, item);
    batchCount++;
    totalSaved++;

    if (batchCount >= CHUNK_SIZE) {
      await batch.commit();
      console.log(`Committed batch of ${batchCount} questions. Progress: ${totalSaved}/${processedQuestions.length}`);
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchCount} questions. Total saved: ${totalSaved}`);
  }

  // Verification step
  console.log('\n--- Verifying Database Stats ---');
  const verifySnap = await getDocs(collection(db, 'questions'));
  const pendingSnap = await getDocs(query(collection(db, 'questions'), where('status', '==', 'pending')));
  const approvedSnap = await getDocs(query(collection(db, 'questions'), where('status', '==', 'approved')));

  console.log(`Total questions now in Firestore: ${verifySnap.size}`);
  console.log(`Total pending review: ${pendingSnap.size}`);
  console.log(`Total approved: ${approvedSnap.size}`);

  console.log('Seeding completed successfully!');
}

run().catch(err => {
  console.error('Seeding failed with error:', err);
  process.exit(1);
});
