# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default Deny**: All unmatched paths in Firestore are strictly denied (`allow read, write: if false;`).
2. **Admin Verification**: Only verified administrators (`isAdmin()`) can create, update, or delete documents in `/questions/{questionId}`, or list `pending`/`rejected` questions. `isAdmin()` requires `request.auth != null && request.auth.token.email_verified == true` and either matches the bootstrapped owner email (`emadkhalid277@gmail.com`) or exists in `/admins/$(request.auth.uid)`.
3. **Public/Player Approved Question Access**: Ordinary users and guests may only read (`get` or `list`) questions whose `resource.data.status == 'approved'`. Unapproved (`pending` or `rejected`) questions are never exposed to non-admin clients.
4. **Strict Schema & Volumetric Bounds**: Every `Question` write must pass `isValidQuestion(incoming())`, enforcing exact key allowlists (`hasAll` and `hasOnly`), valid category enum, valid difficulty enum, valid points (`100, 200, 300, 400, 500`), bounded string lengths, bounded options array (`size() <= 4`), `authorId == request.auth.uid`, and server timestamps (`request.time`).
5. **Immutable Fields**: On update of a `Question`, `id`, `authorId`, and `createdAt` must remain unchanged (`incoming().createdAt == existing().createdAt`, `incoming().authorId == existing().authorId`, `incoming().id == existing().id`), and `reviewedAt == request.time`.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection**: A payload to `/questions/q1` containing an extra field `"isSuperQuestion": true` — rejected by `data.keys().hasOnly(...)`.
2. **Unverified Admin Email Spoof**: A write to `/questions/q1` where `request.auth.token.email == 'emadkhalid277@gmail.com'` but `request.auth.token.email_verified == false` — rejected by `isAdmin()`.
3. **Non-Admin Question Creation**: An authenticated non-admin user attempting to `create` a document in `/questions/q1` — rejected by `isAdmin()`.
4. **Unapproved Question Scraping**: A non-admin client executing a `list` query on `/questions` without filtering `where('status', '==', 'approved')` — rejected by `allow list: if resource.data.status == 'approved' || isAdmin();`.
5. **Identity Spoofing on Create**: An admin creating a question with `authorId: 'someone-else-uid'` instead of `request.auth.uid` — rejected by `data.authorId == request.auth.uid`.
6. **Timestamp Forgery on Create**: Sending a client-crafted `createdAt` timestamp instead of `serverTimestamp()` (`request.time`) — rejected by `incoming().createdAt == request.time`.
7. **Immutable Field Mutation on Update**: Attempting to modify `createdAt` or `authorId` during an `update` — rejected by immutability guards.
8. **Invalid Category Injection**: Creating a question with `category: 'فئة عشوائية'` outside the 8 allowed categories — rejected by enum check.
9. **Invalid Point Value**: Creating a question with `points: 99999` instead of `[100, 200, 300, 400, 500]` — rejected by enum check.
10. **Denial-of-Wallet String Bloat**: Sending a 50KB `questionText` or 2KB `questionId` — rejected by `isValidId(questionId)` and `data.questionText.size() <= 600`.
11. **Array Overflow Attack**: Sending 100 items in `options` array — rejected by `data.options.size() <= 4`.
12. **Self-Privilege Escalation**: A non-admin user attempting to write their own UID into `/admins/{uid}` — rejected by `allow write: if false;` on `/admins/{adminId}`.
