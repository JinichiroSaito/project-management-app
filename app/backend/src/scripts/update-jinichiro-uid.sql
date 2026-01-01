-- jinichirou.saitou@asahi-gh.comのプロフィール情報をFirebase UID (w1bixRIxQqShC43elmZ5Yk5v8fD3) と紐付けるSQL
-- 
-- 本番環境のデータベースで実行してください

-- 1. 現在のユーザー情報を確認
SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved 
FROM users 
WHERE email = 'jinichirou.saitou@asahi-gh.com' 
   OR firebase_uid = 'w1bixRIxQqShC43elmZ5Yk5v8fD3'
   OR name LIKE '%Saito%' OR name LIKE '%斉藤%';

-- 2. 既存のプロフィール情報がある場合、firebase_uidを更新
-- （実際のユーザーIDに置き換える必要があります）
UPDATE users 
SET firebase_uid = 'w1bixRIxQqShC43elmZ5Yk5v8fD3', 
    email = 'jinichirou.saitou@asahi-gh.com',
    updated_at = CURRENT_TIMESTAMP 
WHERE email = 'jinichirou.saitou@asahi-gh.com'
   OR (name LIKE '%Saito%' OR name LIKE '%斉藤%' OR company LIKE '%Asahi%' OR company LIKE '%朝日%')
   OR id IN (
     SELECT id FROM users 
     WHERE name IS NOT NULL 
       AND company IS NOT NULL 
       AND department IS NOT NULL 
       AND position IS NOT NULL
     ORDER BY id
     LIMIT 1
   );

-- 3. 更新後の確認
SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved 
FROM users 
WHERE email = 'jinichirou.saitou@asahi-gh.com' 
   OR firebase_uid = 'w1bixRIxQqShC43elmZ5Yk5v8fD3';

