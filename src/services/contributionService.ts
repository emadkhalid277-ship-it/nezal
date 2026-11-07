import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  UserQuestionList,
  UserCustomQuestion,
  UserContribution,
  TriviaQuestion,
  PointValue,
  DifficultyLevel,
} from '../types/game';

const USER_LISTS_COLLECTION = 'userQuestionLists';
const USER_QUESTIONS_COLLECTION = 'userCustomQuestions';
const CONTRIBUTIONS_COLLECTION = 'contributions';
const QUESTIONS_COLLECTION = 'questions';

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `item-${Date.now()}`;
}

function formatTimestamp(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  return new Date().toISOString();
}

// -------------------------------------------------------------
// 1. User Lists Management
// -------------------------------------------------------------

export async function fetchUserLists(userId: string): Promise<UserQuestionList[]> {
  try {
    const q = query(
      collection(db, USER_LISTS_COLLECTION),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const lists: UserQuestionList[] = [];
    snap.forEach((d) => {
      const data = d.data();
      lists.push({
        id: d.id,
        userId: data.userId || userId,
        name: data.name || 'قائمة بدون اسم',
        description: data.description || '',
        createdAt: formatTimestamp(data.createdAt),
        updatedAt: formatTimestamp(data.updatedAt),
      });
    });

    // Sort newest first
    return lists.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, USER_LISTS_COLLECTION);
  }
}

export async function createUserList(
  userId: string,
  name: string,
  description?: string
): Promise<UserQuestionList> {
  const listId = sanitizeId(`list-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const docRef = doc(db, USER_LISTS_COLLECTION, listId);
  const now = new Date().toISOString();

  const docData = {
    id: listId,
    userId,
    name: name.trim().slice(0, 100),
    description: (description || '').trim().slice(0, 300),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, docData);
    return {
      id: listId,
      userId,
      name: name.trim().slice(0, 100),
      description: (description || '').trim().slice(0, 300),
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${USER_LISTS_COLLECTION}/${listId}`);
  }
}

export async function updateUserList(
  userId: string,
  listId: string,
  name: string,
  description?: string
): Promise<void> {
  const cleanId = sanitizeId(listId);
  const docRef = doc(db, USER_LISTS_COLLECTION, cleanId);

  try {
    await updateDoc(docRef, {
      name: name.trim().slice(0, 100),
      description: (description || '').trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${USER_LISTS_COLLECTION}/${cleanId}`);
  }
}

export async function deleteUserList(userId: string, listId: string): Promise<void> {
  const cleanId = sanitizeId(listId);
  try {
    // Delete all questions in this list first
    const qSnap = await getDocs(
      query(collection(db, USER_QUESTIONS_COLLECTION), where('listId', '==', cleanId))
    );
    const batch = writeBatch(db);
    qSnap.forEach((qd) => {
      batch.delete(qd.ref);
    });
    batch.delete(doc(db, USER_LISTS_COLLECTION, cleanId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${USER_LISTS_COLLECTION}/${cleanId}`);
  }
}

// -------------------------------------------------------------
// 2. User Custom Questions Management
// -------------------------------------------------------------

export async function fetchUserQuestions(
  userId: string,
  listId?: string
): Promise<UserCustomQuestion[]> {
  try {
    const qConstraints = [where('userId', '==', userId)];
    if (listId) {
      qConstraints.push(where('listId', '==', listId));
    }
    const q = query(collection(db, USER_QUESTIONS_COLLECTION), ...qConstraints);
    const snap = await getDocs(q);

    const questions: UserCustomQuestion[] = [];
    snap.forEach((d) => {
      const data = d.data();
      questions.push({
        id: d.id,
        listId: data.listId || '',
        userId: data.userId || userId,
        mainCategoryId: data.mainCategoryId || '',
        mainCategory: data.mainCategory || '',
        subcategoryId: data.subcategoryId || '',
        category: data.category || '',
        questionText: data.questionText || '',
        correctAnswer: data.correctAnswer || '',
        points: (data.points || 100) as PointValue,
        difficulty: (data.difficulty || 'سهل') as DifficultyLevel,
        explanation: data.explanation || '',
        source: data.source || '',
        imageUrl: data.imageUrl || '',
        imageStoragePath: data.imageStoragePath || '',
        imageDescription: data.imageDescription || '',
        contributionStatus: data.contributionStatus || 'draft',
        contributionId: data.contributionId || '',
        rejectionReason: data.rejectionReason || '',
        createdAt: formatTimestamp(data.createdAt),
        updatedAt: formatTimestamp(data.updatedAt),
      });
    });

    return questions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, USER_QUESTIONS_COLLECTION);
  }
}

export interface CreateUserQuestionData {
  listId: string;
  mainCategoryId: string;
  mainCategory: string;
  subcategoryId: string;
  category: string;
  questionText: string;
  correctAnswer: string;
  points: PointValue;
  difficulty: DifficultyLevel;
  explanation?: string;
  source?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  imageDescription?: string;
}

export async function createUserQuestion(
  userId: string,
  data: CreateUserQuestionData
): Promise<UserCustomQuestion> {
  const qId = sanitizeId(`uq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const docRef = doc(db, USER_QUESTIONS_COLLECTION, qId);
  const now = new Date().toISOString();

  const docData = {
    id: qId,
    listId: data.listId,
    userId,
    mainCategoryId: data.mainCategoryId,
    mainCategory: data.mainCategory,
    subcategoryId: data.subcategoryId,
    category: data.category,
    questionText: data.questionText.trim().slice(0, 600),
    correctAnswer: data.correctAnswer.trim().slice(0, 300),
    points: Number(data.points),
    difficulty: data.difficulty,
    explanation: (data.explanation || '').trim().slice(0, 800),
    source: (data.source || '').trim().slice(0, 300),
    imageUrl: data.imageUrl || '',
    imageStoragePath: data.imageStoragePath || '',
    imageDescription: (data.imageDescription || '').trim().slice(0, 300),
    contributionStatus: 'draft',
    contributionId: '',
    rejectionReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, docData);
    return {
      ...data,
      id: qId,
      userId,
      questionText: data.questionText.trim(),
      correctAnswer: data.correctAnswer.trim(),
      explanation: (data.explanation || '').trim(),
      source: (data.source || '').trim(),
      imageUrl: data.imageUrl || '',
      imageStoragePath: data.imageStoragePath || '',
      imageDescription: (data.imageDescription || '').trim(),
      contributionStatus: 'draft',
      contributionId: '',
      rejectionReason: '',
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${USER_QUESTIONS_COLLECTION}/${qId}`);
  }
}

export async function updateUserQuestion(
  userId: string,
  questionId: string,
  data: Partial<CreateUserQuestionData>
): Promise<void> {
  const cleanId = sanitizeId(questionId);
  const docRef = doc(db, USER_QUESTIONS_COLLECTION, cleanId);

  const updateFields: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (data.questionText !== undefined) updateFields.questionText = data.questionText.trim().slice(0, 600);
  if (data.correctAnswer !== undefined) updateFields.correctAnswer = data.correctAnswer.trim().slice(0, 300);
  if (data.points !== undefined) updateFields.points = Number(data.points);
  if (data.difficulty !== undefined) updateFields.difficulty = data.difficulty;
  if (data.explanation !== undefined) updateFields.explanation = data.explanation.trim().slice(0, 800);
  if (data.source !== undefined) updateFields.source = data.source.trim().slice(0, 300);
  if (data.mainCategoryId !== undefined) updateFields.mainCategoryId = data.mainCategoryId;
  if (data.mainCategory !== undefined) updateFields.mainCategory = data.mainCategory;
  if (data.subcategoryId !== undefined) updateFields.subcategoryId = data.subcategoryId;
  if (data.category !== undefined) updateFields.category = data.category;
  if (data.imageUrl !== undefined) updateFields.imageUrl = data.imageUrl;
  if (data.imageStoragePath !== undefined) updateFields.imageStoragePath = data.imageStoragePath;
  if (data.imageDescription !== undefined) updateFields.imageDescription = data.imageDescription.trim().slice(0, 300);

  try {
    await updateDoc(docRef, updateFields);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${USER_QUESTIONS_COLLECTION}/${cleanId}`);
  }
}

export async function deleteUserQuestion(
  userId: string,
  questionId: string,
  imageStoragePath?: string
): Promise<void> {
  const cleanId = sanitizeId(questionId);
  try {
    await deleteDoc(doc(db, USER_QUESTIONS_COLLECTION, cleanId));
    if (imageStoragePath) {
      try {
        const fileRef = ref(storage, imageStoragePath);
        await deleteObject(fileRef);
      } catch (storageErr) {
        console.warn('Could not delete user image from Storage:', storageErr);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${USER_QUESTIONS_COLLECTION}/${cleanId}`);
  }
}

// -------------------------------------------------------------
// 3. Image Upload to Firebase Storage
// -------------------------------------------------------------

export async function uploadUserQuestionImage(
  file: File,
  userId: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('حجم الصورة يتجاوز الحد الأقصى المسموح به (5 ميجابايت).');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة. يرجى اختيار ملف JPG أو PNG أو WEBP.');
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `user-question-images/${userId}/${fileName}`;
  const fileRef = ref(storage, storagePath);

  try {
    await uploadBytes(fileRef, file, { contentType: file.type });
    const downloadUrl = await getDownloadURL(fileRef);
    return { downloadUrl, storagePath };
  } catch (err: any) {
    console.error('Storage upload error:', err);
    throw new Error('تعذر رفع الصورة إلى خادم التخزين. يرجى التحقق من اتصال الإنترنت وحجم الصورة.');
  }
}

// -------------------------------------------------------------
// 4. Submitting Questions for Review (Contributions)
// -------------------------------------------------------------

export async function submitQuestionToAdmin(
  userId: string,
  question: UserCustomQuestion,
  userEmail: string,
  userName: string
): Promise<string> {
  const contribId = sanitizeId(`contrib-${question.id}`);
  const contribRef = doc(db, CONTRIBUTIONS_COLLECTION, contribId);
  const userQRef = doc(db, USER_QUESTIONS_COLLECTION, question.id);

  const contribData = {
    id: contribId,
    originalQuestionId: question.id,
    originalListId: question.listId,
    userId,
    userName: userName || userEmail?.split('@')[0] || 'مستخدم نِزال',
    userEmail: userEmail || '',
    mainCategoryId: question.mainCategoryId,
    mainCategory: question.mainCategory,
    subcategoryId: question.subcategoryId,
    category: question.category,
    questionText: question.questionText,
    correctAnswer: question.correctAnswer,
    points: Number(question.points),
    difficulty: question.difficulty,
    explanation: question.explanation || '',
    source: question.source || '',
    imageUrl: question.imageUrl || '',
    imageStoragePath: question.imageStoragePath || '',
    imageDescription: question.imageDescription || '',
    status: 'pending',
    rejectionReason: '',
    submittedAt: serverTimestamp(),
  };

  try {
    // Write contribution doc
    await setDoc(contribRef, contribData);
    // Update question status in user list
    await updateDoc(userQRef, {
      contributionStatus: 'pending',
      contributionId: contribId,
      rejectionReason: '',
      updatedAt: serverTimestamp(),
    });
    return contribId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${CONTRIBUTIONS_COLLECTION}/${contribId}`);
  }
}

// -------------------------------------------------------------
// 5. Admin Review and Publishing Actions
// -------------------------------------------------------------

export async function fetchAllContributionsForAdmin(): Promise<UserContribution[]> {
  try {
    const q = collection(db, CONTRIBUTIONS_COLLECTION);
    const snap = await getDocs(q);

    const list: UserContribution[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        originalQuestionId: data.originalQuestionId || '',
        originalListId: data.originalListId || '',
        userId: data.userId || '',
        userName: data.userName || '',
        userEmail: data.userEmail || '',
        mainCategoryId: data.mainCategoryId || '',
        mainCategory: data.mainCategory || '',
        subcategoryId: data.subcategoryId || '',
        category: data.category || '',
        questionText: data.questionText || '',
        correctAnswer: data.correctAnswer || '',
        points: (data.points || 100) as PointValue,
        difficulty: (data.difficulty || 'سهل') as DifficultyLevel,
        explanation: data.explanation || '',
        source: data.source || '',
        imageUrl: data.imageUrl || '',
        imageStoragePath: data.imageStoragePath || '',
        imageDescription: data.imageDescription || '',
        status: data.status || 'pending',
        rejectionReason: data.rejectionReason || '',
        publishedQuestionId: data.publishedQuestionId || '',
        submittedAt: formatTimestamp(data.submittedAt),
        reviewedAt: data.reviewedAt ? formatTimestamp(data.reviewedAt) : undefined,
        reviewedBy: data.reviewedBy || '',
      });
    });

    // Pending first, then newest
    return list.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, CONTRIBUTIONS_COLLECTION);
  }
}

export async function approveAndPublishContribution(
  contribution: UserContribution,
  adminId: string
): Promise<string> {
  // Idempotency: use deterministic target ID so repeated clicks do not create duplicates
  const publishedId = sanitizeId(`q-pub-${contribution.id}`);
  const targetDocRef = doc(db, QUESTIONS_COLLECTION, publishedId);
  const contribRef = doc(db, CONTRIBUTIONS_COLLECTION, contribution.id);

  // Payload for global questions bank
  const publishedData = {
    id: publishedId,
    subcategoryId: contribution.subcategoryId,
    category: contribution.category,
    mainCategoryId: contribution.mainCategoryId,
    mainCategory: contribution.mainCategory,
    questionText: contribution.questionText.trim().slice(0, 600),
    questionType: 'direct',
    difficulty: contribution.difficulty,
    points: Number(contribution.points),
    options: [],
    correctAnswer: contribution.correctAnswer.trim().slice(0, 300),
    explanation: (contribution.explanation || '').trim().slice(0, 800),
    source: (contribution.source || `مساهمة من ${contribution.userName}`).trim().slice(0, 300),
    status: 'approved',
    imageUrl: contribution.imageUrl || '',
    imageStoragePath: contribution.imageStoragePath || '',
    imageDescription: contribution.imageDescription || '',
    authorId: contribution.userId || adminId,
    createdAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
  };

  try {
    // 1. Publish to main questions collection
    await setDoc(targetDocRef, publishedData);

    // 2. Mark contribution as approved
    await updateDoc(contribRef, {
      status: 'approved',
      publishedQuestionId: publishedId,
      reviewedAt: serverTimestamp(),
      reviewedBy: adminId,
    });

    // 3. Update the user question doc if accessible
    if (contribution.originalQuestionId) {
      try {
        const userQRef = doc(db, USER_QUESTIONS_COLLECTION, contribution.originalQuestionId);
        await updateDoc(userQRef, {
          contributionStatus: 'approved',
          updatedAt: serverTimestamp(),
        });
      } catch (uErr) {
        console.warn('Could not update original user question status:', uErr);
      }
    }

    return publishedId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${QUESTIONS_COLLECTION}/${publishedId}`);
  }
}

export async function rejectContribution(
  contribution: UserContribution,
  reason: string,
  adminId: string
): Promise<void> {
  const contribRef = doc(db, CONTRIBUTIONS_COLLECTION, contribution.id);

  try {
    await updateDoc(contribRef, {
      status: 'rejected',
      rejectionReason: reason.trim().slice(0, 300),
      reviewedAt: serverTimestamp(),
      reviewedBy: adminId,
    });

    if (contribution.originalQuestionId) {
      try {
        const userQRef = doc(db, USER_QUESTIONS_COLLECTION, contribution.originalQuestionId);
        await updateDoc(userQRef, {
          contributionStatus: 'rejected',
          rejectionReason: reason.trim().slice(0, 300),
          updatedAt: serverTimestamp(),
        });
      } catch (uErr) {
        console.warn('Could not update original user question status:', uErr);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${CONTRIBUTIONS_COLLECTION}/${contribution.id}`);
  }
}
