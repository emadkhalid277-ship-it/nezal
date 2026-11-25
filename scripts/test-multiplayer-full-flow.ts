import {
  confirmOnlineCategories,
  createOnlineRoom,
  dismissResolvedOnlineQuestion,
  fetchOnlineRoom,
  getRoomDoc,
  hostStartGame,
  joinOnlineRoom,
  selectOnlineQuestion,
  submitOnlineAnswer,
  toggleOnlineSubcategoryPick,
} from '../src/services/multiplayerService';
import { getDoc } from 'firebase/firestore';

async function runMultiplayerVerification() {
  console.log('========================================================');
  console.log('🚀 بدء الفحص التقني الشامل لنظام اللعب عن بُعد الثنائي (NIZAL)');
  console.log('========================================================\n');

  const hostUser = {
    uid: 'host_test_uid_999',
    displayName: 'المضيف سلطان',
    email: 'host@test.com',
  } as any;

  const guestUser = {
    uid: 'guest_test_uid_888',
    displayName: 'الضيف فهد',
    email: 'fahad@test.com',
  } as any;

  const room = await createOnlineRoom({
    hostName: 'المضيف سلطان',
    user: hostUser,
    timerDuration: 60,
  });

  console.log(`✅ تم إنشاء الغرفة بنجاح! الكود: [${room.code}] | الحالة: ${room.status}`);

  const roomSnap = await getDoc(getRoomDoc(room.code));
  if (!roomSnap.exists()) {
    throw new Error('❌ فشل العثور على الغرفة في Firestore بعد إنشائها!');
  }

  const joinResult = await joinOnlineRoom({
    code: room.code,
    playerName: 'الضيف فهد',
    user: guestUser,
  });
  console.log(`✅ انضم الضيف [${joinResult.player.name}] -> الفريق: ${joinResult.player.teamId}`);

  const hostCats = ['sub-islamic-general', 'sub-world-capitals', 'sub-science'];
  for (const catId of hostCats) {
    await toggleOnlineSubcategoryPick(room.code, catId);
  }
  await confirmOnlineCategories(room.code, true);

  await hostStartGame(room.code);
  const startedRoom = await fetchOnlineRoom(room.code);
  if (!startedRoom || startedRoom.status !== 'playing') {
    throw new Error(`❌ حالة الغرفة بعد البدء غير متوقعة: ${startedRoom?.status}`);
  }
  console.log(`✅ بدأت المباراة بنجاح! الدور الأول: ${startedRoom.activeTurnRole}`);

  await selectOnlineQuestion({
    code: room.code,
    tileKey: `${hostCats[0]}__100`,
    questionId: 'q_test_100',
    subcategoryName: 'إسلاميات عامة',
  });

  await submitOnlineAnswer({ code: room.code, answer: 'إجابة تجريبية' });
  await dismissResolvedOnlineQuestion(room.code);

  console.log('✅ اكتمل التحقق من تدفق المضيف والضيف!');
}

if (process.env.RUN_MP_SCRIPT === '1') {
  runMultiplayerVerification().catch((err) => {
    console.error('❌ خطأ أثناء تنفيذ الفحص:', err);
    process.exit(1);
  });
}
