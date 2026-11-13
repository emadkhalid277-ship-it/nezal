# دليل وقواعد أمان Firestore لمنصة نِزال (NIZAL)
**مشروع Firebase الخاص بك:** `nezal-4ea44`

لقد تم ربط موقعك بمشروع Firebase الخاص بك بنجاح (`nezal-4ea44`).
لتفعيل حفظ وتزامن البيانات وقواعد الأمان وحماية الموقع، انسخ القواعد أدناه وضعها في لوحة تحكم Firebase الخاصة بك.

---

## الخطوة 1: تحديث قواعد أمان Firestore (Rules)

1. افتح صفحة القواعد في مشروعك مباشرة من الرابط التالي:
   👉 **[قواعد Firestore في منصة Firebase](https://console.firebase.google.com/project/nezal-4ea44/firestore/rules)**
2. امسح أي قواعد قديمة موجودة في المربع.
3. انسخ الكود الكامل التالي وضعه في المربع:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 1. حماية شاملة كافتراضية
    match /{document=**} {
      allow read, write: if false;
    }

    // دوال التحقق المساعدة
    function isValidId(id) {
      return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isVerifiedUser() {
      return isSignedIn() && (request.auth.token.email_verified == true || request.auth.token.firebase.sign_in_provider == 'google.com');
    }

    // المشرف: إما بريدك الإلكتروني المعتمد أو مسجل في جدول admins
    function isAdmin() {
      return isSignedIn() && (
        request.auth.token.email == 'emadkhalid277@gmail.com' ||
        exists(/databases/$(database)/documents/admins/$(request.auth.uid))
      );
    }

    // 2. جدول المشرفين (admins)
    match /admins/{adminId} {
      allow get: if isSignedIn() && isValidId(adminId) && request.auth.uid == adminId;
      allow list: if false;
      allow create, update, delete: if false;
    }

    // 3. جدول المستخدمين وتسجيل الدخول (users)
    match /users/{userId} {
      // المستخدم يقرأ ويحدث ملفه الشخصي، والمشرف يمكنه قراءة جميع المستخدمين
      allow get: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow list: if isAdmin();
      allow create, update: if isSignedIn() && request.auth.uid == userId;
      allow delete: if isAdmin();
    }

    // 4. جدول جلسات وسجلات اللعب (gameSessions)
    match /gameSessions/{sessionId} {
      allow get, list: if true;
      allow create: if true;
      allow update: if true;
      allow delete: if isAdmin();
    }

    // 5. الفئات الرئيسية (mainCategories)
    match /mainCategories/{mainCategoryId} {
      allow get, list: if true;
      allow create, update, delete: if isAdmin();
    }

    // 6. الفئات الفرعية (subcategories)
    match /subcategories/{subcategoryId} {
      allow get, list: if true;
      allow create, update, delete: if isAdmin();
    }

    // 7. بنك الأسئلة (questions)
    match /questions/{questionId} {
      allow get: if isValidId(questionId);
      allow list: if true;
      allow create: if isValidId(questionId) && (isAdmin() || (incoming().authorId == 'system' && incoming().status == 'pending'));
      allow update, delete: if isValidId(questionId) && isAdmin();
    }

    // 8. إعدادات المنصة والتواصل (settings)
    match /settings/{settingId} {
      allow get, list: if true;
      allow create, update: if isAdmin();
      allow delete: if false;
    }

    // 9. غرف اللعب عن بُعد (gameRooms)
    match /gameRooms/{roomId} {
      allow get, list: if true;
      allow create, update: if true;
      allow delete: if isAdmin();
    }

    // 10. سجل المباريات والتقدم (userGameMatches)
    match /userGameMatches/{matchId} {
      allow get: if isValidId(matchId) && (isAdmin() || (isSignedIn() && resource.data.userId == request.auth.uid));
      allow list: if isAdmin() || (isSignedIn() && resource.data.userId == request.auth.uid);
      allow create: if isSignedIn() && isValidId(matchId) && incoming().userId == request.auth.uid;
      allow update, delete: if isValidId(matchId) && (isAdmin() || (isSignedIn() && existing().userId == request.auth.uid));
    }

    // 11. نظام الأصدقاء والحضور والدعوات والإشعارات
    // (ملاحظة: النسخة الكاملة والصارمة لقواعد الأمان موجودة في ملف firestore.rules داخل المشروع)
    match /playerProfiles/{userId} {
      allow get, list: if isSignedIn();
      allow create, update: if isSignedIn() && request.auth.uid == userId;
      allow delete: if isAdmin();
    }
    match /userBlocks/{blockId} {
      allow get: if isSignedIn() && (blockId.matches('^' + request.auth.uid + '_.*') || blockId.matches('.*_' + request.auth.uid + '$'));
      allow list: if isSignedIn() && resource.data.blockerUid == request.auth.uid;
      allow create: if isSignedIn() && incoming().blockerUid == request.auth.uid;
      allow delete: if isSignedIn() && existing().blockerUid == request.auth.uid;
    }
    match /friendRequests/{requestId} {
      allow get, list: if isSignedIn() && (resource.data.fromUid == request.auth.uid || resource.data.toUid == request.auth.uid);
      allow create: if isSignedIn() && incoming().fromUid == request.auth.uid;
      allow update, delete: if isSignedIn() && (existing().fromUid == request.auth.uid || existing().toUid == request.auth.uid);
    }
    match /friendships/{pairId} {
      allow get, list: if isSignedIn() && (resource.data.user1 == request.auth.uid || resource.data.user2 == request.auth.uid);
      allow create: if isSignedIn() && (incoming().user1 == request.auth.uid || incoming().user2 == request.auth.uid);
      allow delete: if isSignedIn() && (existing().user1 == request.auth.uid || existing().user2 == request.auth.uid);
    }
    match /gameInvites/{inviteId} {
      allow get, list: if isSignedIn() && (resource.data.fromUid == request.auth.uid || resource.data.toUid == request.auth.uid);
      allow create: if isSignedIn() && incoming().fromUid == request.auth.uid;
      allow update, delete: if isSignedIn() && (existing().fromUid == request.auth.uid || existing().toUid == request.auth.uid);
    }
    match /notifications/{notifId} {
      allow get, list: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow create: if isSignedIn() && incoming().actorUid == request.auth.uid;
      allow update, delete: if isSignedIn() && existing().userId == request.auth.uid;
    }
  }
}
```

4. اضغط على زر **«نشر» (Publish)** في أعلى يمين الصفحة داخل Firebase.

---

## الخطوة 2: تفعيل تسجيل الدخول (Authentication)

1. افتح صفحة تسجيل الدخول في مشروعك:
   👉 **[Authentication في منصة Firebase](https://console.firebase.google.com/project/nezal-4ea44/authentication/providers)**
2. اضغط على **«Get Started» (البدء)** إذا لم تكن مفعلة.
3. فعّل طرق تسجيل الدخول التالية:
   - **Google**: فعّلها واختر إيميل الدعم (`emadkhalid277@gmail.com`) ثم حفظ.
   - **Email/Password (البريد الإلكتروني/كلمة المرور)**: فعّلها ثم اضغط حفظ.
4. في قسم **Settings -> Authorized Domains** (النطاقات المصرح بها):
   تأكد من إضافة النطاق الخاص بتطبيقك أو نطاق موقعك حتى يعمل تسجيل دخول Google بسلاسة.

---

## الخطوة 3: تفعيل قاعدة بيانات Firestore

إذا لم تكن أنشأت Firestore Database بعد:
1. اذهب إلى: **[Firestore Database](https://console.firebase.google.com/project/nezal-4ea44/firestore)**
2. اضغط **Create Database**، واختر المنطقة الأقرب لك (مثل `eur3 (europe-west)` أو `asia-south1`).
3. اختر وضع **Production Mode**، ثم اضغط **Create**.
4. طبق الخطوة 1 لنشر القواعد.

---

## البيانات المحفوظة في الفايرستور تلقائياً:

- **الأسئلة والبنك**: كل الأسئلة الـ 1938 والفئات تخزن في `/questions` و `/subcategories` و `/mainCategories`.
- **ملفات اللاعبين والمشرفين**: عند تسجيل الدخول، يتم إنشاء ملف المستخدم وتحديث وقت الدخول تلقائياً في `/users/{userId}`.
- **إعدادات التواصل**: رقم الواتساب والبريد وروابط التواصل تخزن في `/settings/contact`.
- **المباريات وسجل التحديات**: نتائج المباريات والفرق الفائزة تُحفظ في `/gameSessions`.
