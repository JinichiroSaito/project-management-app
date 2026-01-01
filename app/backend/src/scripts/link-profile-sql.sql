-- jinichirou.saitou@asahi-gh.comのプロフィール情報をFirebaseユーザーと紐付けるSQL
-- 
-- 使用方法:
-- 1. FirebaseからUIDを取得: node src/scripts/get-firebase-uid.js jinichirou.saitou@asahi-gh.com
-- 2. 以下のSQLを実行して、firebase_uidを更新

-- まず、現在のユーザー情報を確認
SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved 
FROM users 
WHERE email = 'jinichirou.saitou@asahi-gh.com';

-- Firebase UIDを取得した後、以下のSQLを実行（FIREBASE_UIDを実際のUIDに置き換える）
-- UPDATE users 
-- SET firebase_uid = 'FIREBASE_UID', updated_at = CURRENT_TIMESTAMP 
-- WHERE email = 'jinichirou.saitou@asahi-gh.com';

-- 更新後の確認
-- SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved 
-- FROM users 
-- WHERE email = 'jinichirou.saitou@asahi-gh.com';

