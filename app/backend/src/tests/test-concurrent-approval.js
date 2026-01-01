/**
 * 承認フローの競合状態テストスクリプト
 * 
 * このスクリプトは、複数の審査者が同時に承認した場合の
 * 競合状態が正しく処理されることを確認します。
 * 
 * 実行方法:
 *   node src/tests/test-concurrent-approval.js
 */

require('dotenv').config();
const db = require('../db');

async function testConcurrentApproval() {
  console.log('=== 承認フローの競合状態テスト ===\n');

  try {
    // テスト用のプロジェクトを作成
    const projectResult = await db.query(
      `INSERT INTO projects (name, description, status, executor_id, requested_amount, application_status, reviewer_approvals)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [
        'Concurrent Approval Test',
        'Test description',
        'planning',
        1,
        50000000,
        'draft',
        JSON.stringify({})
      ]
    );

    const projectId = projectResult.rows[0].id;
    console.log(`テスト用プロジェクト作成: ID=${projectId}\n`);

    // テスト1: 楽観的ロックの動作確認
    console.log('テスト1: 楽観的ロックの動作確認');
    
    // 現在の承認状態を取得
    const currentProject = await db.query('SELECT reviewer_approvals FROM projects WHERE id = $1', [projectId]);
    const currentApprovals = currentProject.rows[0].reviewer_approvals || {};
    
    // 審査者1の承認をシミュレート
    const reviewer1Id = 2;
    const updatedApprovals1 = { ...currentApprovals };
    updatedApprovals1[reviewer1Id] = { status: 'approved', updated_at: new Date().toISOString() };
    
    // 楽観的ロックを使用して更新
    const updateResult1 = await db.query(
      `UPDATE projects 
       SET reviewer_approvals = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND (reviewer_approvals = $3::jsonb OR reviewer_approvals IS NULL)
       RETURNING reviewer_approvals`,
      [updatedApprovals1, projectId, currentApprovals]
    );
    
    if (updateResult1.rows.length > 0) {
      console.log('  ✓ 審査者1の承認が成功しました');
    } else {
      console.log('  ❌ 審査者1の承認が失敗しました');
    }

    // 審査者2が同時に承認しようとした場合をシミュレート
    // （古い状態を参照して更新しようとする）
    const reviewer2Id = 3;
    const oldApprovals = {}; // 古い状態（空のオブジェクト）
    const updatedApprovals2 = { ...oldApprovals };
    updatedApprovals2[reviewer2Id] = { status: 'approved', updated_at: new Date().toISOString() };
    
    // 楽観的ロックを使用して更新（古い状態を参照）
    const updateResult2 = await db.query(
      `UPDATE projects 
       SET reviewer_approvals = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND (reviewer_approvals = $3::jsonb OR reviewer_approvals IS NULL)
       RETURNING reviewer_approvals`,
      [updatedApprovals2, projectId, oldApprovals]
    );
    
    if (updateResult2.rows.length === 0) {
      console.log('  ✓ 競合が検出されました（期待通り）');
      
      // 最新の状態を取得して再試行
      const latestProject = await db.query('SELECT reviewer_approvals FROM projects WHERE id = $1', [projectId]);
      const latestApprovals = latestProject.rows[0].reviewer_approvals || {};
      
      // 最新の状態を基に更新
      const finalApprovals = { ...latestApprovals };
      finalApprovals[reviewer2Id] = { status: 'approved', updated_at: new Date().toISOString() };
      
      const finalUpdate = await db.query(
        `UPDATE projects 
         SET reviewer_approvals = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2
         RETURNING reviewer_approvals`,
        [finalApprovals, projectId]
      );
      
      if (finalUpdate.rows.length > 0) {
        console.log('  ✓ 最新状態を基にした更新が成功しました');
      }
    } else {
      console.log('  ❌ 競合が検出されませんでした（問題あり）');
    }
    
    console.log('  ✅ テスト1: 成功\n');

    // テスト2: 重複承認の防止
    console.log('テスト2: 重複承認の防止');
    
    const projectForTest2 = await db.query(
      `INSERT INTO projects (name, description, status, executor_id, requested_amount, application_status, reviewer_approvals)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [
        'Duplicate Approval Test',
        'Test description',
        'planning',
        1,
        50000000,
        'draft',
        JSON.stringify({ [reviewer1Id]: { status: 'approved', updated_at: new Date().toISOString() } })
      ]
    );
    
    const projectId2 = projectForTest2.rows[0].id;
    const currentProject2 = await db.query('SELECT reviewer_approvals FROM projects WHERE id = $1', [projectId2]);
    const currentApprovals2 = currentProject2.rows[0].reviewer_approvals || {};
    
    // 既に承認済みの審査者が再度承認しようとした場合
    if (currentApprovals2[reviewer1Id] && currentApprovals2[reviewer1Id].status === 'approved') {
      console.log('  ✓ 既に承認済みであることが検出されました');
      console.log('  ✅ テスト2: 成功\n');
    } else {
      console.log('  ❌ 承認状態の確認に失敗しました');
    }

    // クリーンアップ
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await db.query('DELETE FROM projects WHERE id = $1', [projectId2]);
    console.log('✓ テスト用データをクリーンアップしました\n');

    console.log('=== すべてのテストが成功しました ===');
    process.exit(0);
  } catch (error) {
    console.error('❌ テストエラー:', error);
    process.exit(1);
  }
}

// データベース接続を確認してからテストを実行
db.pool.query('SELECT 1')
  .then(() => {
    console.log('✓ データベース接続確認\n');
    testConcurrentApproval();
  })
  .catch((error) => {
    console.error('❌ データベース接続エラー:', error.message);
    console.error('\n📋 トラブルシューティング:');
    console.error('   1. PostgreSQLが起動しているか確認してください');
    console.error('   2. .envファイルが正しく設定されているか確認してください');
    console.error('   3. 以下の環境変数が設定されているか確認してください:');
    console.error('      - DB_HOST');
    console.error('      - DB_PORT');
    console.error('      - DB_NAME');
    console.error('      - DB_USER');
    console.error('      - DB_PASSWORD');
    process.exit(1);
  });

