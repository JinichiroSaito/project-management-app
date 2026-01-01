-- jinichirou.saitou@asahi-gh.comのプロフィール情報をFirebase UID (w1bixRIxQqShC43elmZ5Yk5v8fD3) と紐付けるSQL
-- 
-- 使用方法:
-- 1. 本番環境のデータベースに接続
-- 2. 以下のSQLを実行

-- まず、現在のユーザー情報を確認
SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved 
FROM users 
WHERE email = 'jinichirou.saitou@asahi-gh.com' 
   OR firebase_uid = 'w1bixRIxQqShC43elmZ5Yk5v8fD3';

-- 既存のプロフィール情報があるか確認（emailが異なる可能性があるため、nameやcompanyで検索）
SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved 
FROM users 
WHERE name LIKE '%Saito%' OR name LIKE '%斉藤%' OR company LIKE '%Asahi%' OR company LIKE '%朝日%'
ORDER BY id;

-- プロフィール情報が見つかった場合、以下のSQLを実行して紐付ける
-- （実際のユーザーIDに置き換える必要があります）
-- UPDATE users 
-- SET firebase_uid = 'w1bixRIxQqShC43elmZ5Yk5v8fD3', 
--     email = 'jinichirou.saitou@asahi-gh.com',
--     updated_at = CURRENT_TIMESTAMP 
-- WHERE id = <USER_ID>;

-- または、emailで直接更新（既存のプロフィール情報がある場合）
-- UPDATE users 
-- SET firebase_uid = 'w1bixRIxQqShC43elmZ5Yk5v8fD3', 
--     updated_at = CURRENT_TIMESTAMP 
-- WHERE email = 'jinichirou.saitou@asahi-gh.com';

-- 更新後の確認
-- SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved 
-- FROM users 
-- WHERE email = 'jinichirou.saitou@asahi-gh.com' 
--    OR firebase_uid = 'w1bixRIxQqShC43elmZ5Yk5v8fD3';

