/**
 * トランザクション処理のテストスクリプト
 * 
 * このスクリプトは、プロジェクト作成・更新時のトランザクション処理が
 * 正しく動作することを確認します。
 * 
 * 実行方法:
 *   node src/tests/test-transaction.js
 */

require('dotenv').config();
const db = require('../db');

async function testTransaction() {
  console.log('=== トランザクション処理のテスト ===\n');

  try {
    // テスト1: 正常なトランザクション
    console.log('テスト1: 正常なトランザクション処理');
    await db.withTransaction(async (client) => {
      // テスト用のプロジェクトを作成
      const projectResult = await client.query(
        `INSERT INTO projects (name, description, status, executor_id, requested_amount, application_status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        ['Transaction Test Project', 'Test description', 'planning', 1, 50000000, 'draft']
      );
      
      const projectId = projectResult.rows[0].id;
      console.log(`  ✓ プロジェクト作成成功: ID=${projectId}`);

      // 審査者を追加
      await client.query(
        'INSERT INTO project_reviewers (project_id, reviewer_id) VALUES ($1, $2)',
        [projectId, 2]
      );
      console.log('  ✓ 審査者追加成功');

      // クリーンアップ（テスト用データを削除）
      await client.query('DELETE FROM project_reviewers WHERE project_id = $1', [projectId]);
      await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
      console.log('  ✓ クリーンアップ完了');
    });
    console.log('  ✅ テスト1: 成功\n');

    // テスト2: ロールバックのテスト
    console.log('テスト2: エラー時のロールバック処理');
    try {
      await db.withTransaction(async (client) => {
        // プロジェクトを作成
        const projectResult = await client.query(
          `INSERT INTO projects (name, description, status, executor_id, requested_amount, application_status)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          ['Rollback Test Project', 'Test description', 'planning', 1, 50000000, 'draft']
        );
        
        const projectId = projectResult.rows[0].id;
        console.log(`  ✓ プロジェクト作成成功: ID=${projectId}`);

        // 意図的にエラーを発生させる（存在しないカラム）
        await client.query('INSERT INTO invalid_table (invalid_column) VALUES ($1)', ['error']);
      });
      console.log('  ❌ テスト2: エラーが発生すべきでしたが発生しませんでした');
    } catch (error) {
      console.log('  ✓ エラーが発生しました（期待通り）:', error.message);
      
      // ロールバックが正しく動作したか確認（プロジェクトが存在しないことを確認）
      const checkResult = await db.query(
        "SELECT id FROM projects WHERE name = 'Rollback Test Project'"
      );
      
      if (checkResult.rows.length === 0) {
        console.log('  ✓ ロールバック確認: プロジェクトは作成されていません（正しい）');
        console.log('  ✅ テスト2: 成功\n');
      } else {
        console.log('  ❌ テスト2: ロールバックが正しく動作していません');
      }
    }

    // テスト3: 複数のクエリがトランザクション内で実行されることを確認
    console.log('テスト3: 複数クエリのトランザクション処理');
    await db.withTransaction(async (client) => {
      const projectResult = await client.query(
        `INSERT INTO projects (name, description, status, executor_id, requested_amount, application_status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        ['Multi Query Test', 'Test description', 'planning', 1, 50000000, 'draft']
      );
      
      const projectId = projectResult.rows[0].id;
      
      // 複数の審査者を追加
      for (let i = 2; i <= 4; i++) {
        await client.query(
          'INSERT INTO project_reviewers (project_id, reviewer_id) VALUES ($1, $2)',
          [projectId, i]
        );
      }
      
      // 審査者の数を確認
      const reviewersResult = await client.query(
        'SELECT COUNT(*) as count FROM project_reviewers WHERE project_id = $1',
        [projectId]
      );
      
      if (parseInt(reviewersResult.rows[0].count) === 3) {
        console.log('  ✓ 複数の審査者が正しく追加されました');
      } else {
        throw new Error(`期待される審査者数: 3, 実際: ${reviewersResult.rows[0].count}`);
      }

      // クリーンアップ
      await client.query('DELETE FROM project_reviewers WHERE project_id = $1', [projectId]);
      await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
      console.log('  ✓ クリーンアップ完了');
    });
    console.log('  ✅ テスト3: 成功\n');

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
    testTransaction();
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
    console.error('\n   ローカル開発環境の場合:');
    console.error('   - PostgreSQLを起動: brew services start postgresql (macOS)');
    console.error('   - .envファイルを作成してデータベース設定を追加');
    process.exit(1);
  });

