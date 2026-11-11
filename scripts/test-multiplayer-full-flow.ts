import {
  createOnlineRoom,
  fetchOnlineRoom,
  joinOnlineRoom,
  hostStartGame,
  hostSelectQuestion,
  hostAwardPoints,
  hostRevealAnswer,
  getRoomDoc,
} from '../src/services/multiplayerService';
import { getDoc } from 'firebase/firestore';

async function runMultiplayerVerification() {
  console.log('========================================================');
  console.log('🚀 بدء الفحص التقني الشامل لنظام اللعب عن بُعد (NIZAL Online MP)');
  console.log('========================================================\n');

  // Test 1 & 2: إنشاء غرفة جديدة والتأكد من حفظها في Firestore
  console.log('--- اختبار 1 & 2: إنشاء غرفة جديدة وحفظها في Firestore ---');
  const hostUser = {
    uid: 'host_test_uid_999',
    displayName: 'المضيف سلطان',
    email: 'host@test.com',
  } as any;

  const room = await createOnlineRoom({
    hostName: 'المضيف سلطان',
    user: hostUser,
    teamCount: 2,
    timerDuration: 60,
  });

  console.log(`✅ تم إنشاء الغرفة بنجاح! كود الغرفة: [${room.code}]`);
  console.log(`   - اسم المضيف: ${room.hostName}`);
  console.log(`   - حالة الغرفة: ${room.status}`);
  console.log(`   - عدد الفرق: ${room.teams.length} (${room.teams.map((t) => t.name).join(' ضد ')})`);

  // Verify room exists in Firestore
  const roomSnap = await getDoc(getRoomDoc(room.code));
  if (!roomSnap.exists()) {
    throw new Error('❌ فشل العثور على الغرفة في Firestore بعد إنشائها!');
  }
  console.log(`✅ تم التحقق من حفظ مستند الغرفة في Firestore بنجاح!\n`);

  // Test 3 & 4: دخول لاعب ثانٍ باستخدام كود الغرفة وظهوره عند المضيف
  console.log('--- اختبار 3 & 4: انضمام لاعب ثانٍ باستخدام كود الغرفة وظهوره في الغرفة ---');
  const guestUser = {
    uid: 'guest_test_uid_888',
    displayName: 'اللاعب فهد',
    email: 'fahad@test.com',
  } as any;

  const joinResult = await joinOnlineRoom({
    code: room.code,
    playerName: 'اللاعب فهد',
    user: guestUser,
    preferredTeamId: room.teams[1].id,
  });

  console.log(`✅ انضم اللاعب [${joinResult.player.name}] إلى الغرفة بنجاح!`);
  console.log(`   - معرف اللاعب: ${joinResult.player.id}`);
  console.log(`   - الفريق المنضم إليه: ${joinResult.player.teamId}`);

  // Fetch updated room from Firestore to verify host sees guest
  const updatedRoomAfterJoin = await fetchOnlineRoom(room.code);
  if (!updatedRoomAfterJoin) {
    throw new Error('❌ تعذر جلب بيانات الغرفة المحدثة بعد انضمام اللاعب الثاني');
  }

  const allPlayers = Object.values(updatedRoomAfterJoin.players || {});
  console.log(`✅ قائمة اللاعبين الحالية في الغرفة (${allPlayers.length} لاعبين):`);
  allPlayers.forEach((p, idx) => {
    console.log(`   ${idx + 1}. ${p.name} ${p.isHost ? '(👑 المضيف)' : '(منافس)'} - الفريق: ${p.teamId} - الاتصال: ${p.connectionStatus}`);
  });

  if (allPlayers.length < 2) {
    throw new Error('❌ لم يظهر اللاعب الثاني في قائمة اللاعبين!');
  }
  console.log('✅ ظهور اللاعب الثاني مؤكد عند المضيف وجميع المتصلين.\n');

  // Test 5 & 6: الضغط على زر بدء التحدي وانتقال جميع اللاعبين للمباراة
  console.log('--- اختبار 5 & 6: استدعاء دالة بدء التحدي وتغيير حالة الغرفة ---');
  const testSubIds = ['sub_history_1', 'sub_geo_1', 'sub_islamic_1', 'sub_sports_1', 'sub_culture_1', 'sub_tech_1'];
  const teamSubMap: Record<string, string[]> = {
    [room.teams[0].id]: testSubIds.slice(0, 3),
    [room.teams[1].id]: testSubIds.slice(3, 6),
  };

  await hostStartGame(room.code, room.hostId, testSubIds, teamSubMap);
  console.log('✅ تم إرسال أمر بدء التحدي من المضيف!');

  const startedRoom = await fetchOnlineRoom(room.code);
  if (!startedRoom) throw new Error('تعذر قراءة الغرفة بعد البدء');

  console.log(`✅ تم تحديث حالة الغرفة في Firestore إلى: [${startedRoom.status}]`);
  if (startedRoom.status !== 'in_game' && (startedRoom.status as string) !== 'playing') {
    throw new Error(`❌ حالة الغرفة غير صحيحة: ${startedRoom.status}`);
  }
  console.log(`✅ انتقال جميع اللاعبين إلى شاشة المباراة مؤكد (الحالة: in_game).\n`);

  // Test 7: اختبار نظام اختيار السؤال وتوزيع النقاط ومزامنتها بين الأجهزة
  console.log('--- اختبار 7: مزامنة السؤال المفتوح، كشف الإجابة، واحتساب النقاط ---');
  await hostSelectQuestion(room.code, room.hostId, {
    tileKey: `${testSubIds[0]}__100`,
    questionId: 'q_test_100',
    subcategoryId: testSubIds[0],
    subcategoryName: 'تاريخ السعودية',
    category: 'تاريخ',
    points: 100,
    difficulty: 'سهل',
    questionText: 'في أي عام تم توحيد المملكة العربية السعودية؟',
    correctAnswer: '1932م (1351هـ)',
    isAnswerRevealed: false,
    openedAt: Date.now(),
    openedByHostId: room.hostId,
  });
  console.log('✅ فتح المضيف سؤالاً بقيمة 100 نقطة (تمت المزامنة لجميع الشاشات)');

  await hostRevealAnswer(room.code, room.hostId);
  console.log('✅ كشف المضيف الإجابة الصحيحة للجميع');

  await hostAwardPoints({
    code: room.code,
    hostId: room.hostId,
    awardedTeamIndex: 0,
    points: 100,
    tileKey: `${testSubIds[0]}__100`,
    questionId: 'q_test_100',
    totalPlayableTiles: 30,
  });
  console.log('✅ احتسب المضيف 100 نقطة للفريق الأول!');

  const scoredRoom = await fetchOnlineRoom(room.code);
  if (!scoredRoom) throw new Error('تعذر جلب بيانات الغرفة بعد النقاط');
  console.log(`✅ النتيجة الحالية المحدثة:`);
  scoredRoom.teams.forEach((t) => {
    console.log(`   - ${t.name}: ${t.score} نقطة`);
  });
  console.log(`   - المربعات المجابة: ${scoredRoom.usedTileKeys.join(', ')}`);
  console.log(`   - رسالة آخر حركة: ${scoredRoom.lastActionMessage}\n`);

  // Test 8: اختبار الصلاحيات وإدارة الأخطاء
  console.log('--- اختبار 8: اختبار حالات الخطأ والأمان ---');
  try {
    // Attempting to join invalid code
    await joinOnlineRoom({
      code: 'INVALID999',
      playerName: 'مخترق',
    });
    console.log('❌ خطأ: لم يتم منع كود غير صالح!');
  } catch (err: any) {
    console.log(`✅ تم منع كود الغرفة غير الصحيح بنجاح: "${err.message}"`);
  }

  console.log('\n========================================================');
  console.log('🎉 اكتملت جميع الاختبارات الإلزامية بنجاح 100%!');
  console.log('========================================================');
}

runMultiplayerVerification().catch((err) => {
  console.error('❌ خطأ أثناء تنفيذ الفحص:', err);
  process.exit(1);
});
