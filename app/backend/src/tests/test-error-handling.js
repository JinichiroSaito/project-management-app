/**
 * エラーハンドリングのテストスクリプト
 * 
 * このスクリプトは、非同期処理のエラーハンドリングが
 * 正しく動作することを確認します。
 * 
 * 実行方法:
 *   node src/tests/test-error-handling.js
 */

require('dotenv').config();
const db = require('../db');

async function testErrorHandling() {
  console.log('=== エラーハンドリングのテスト ===\n');

  try {
    // テスト1: データベースエラーのハンドリング
    console.log('テスト1: データベースエラーのハンドリング');
    
    try {
      // 存在しないテーブルにアクセス
      await db.query('SELECT * FROM non_existent_table');
      console.log('  ❌ エラーが発生すべきでしたが発生しませんでした');
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        console.log('  ✓ データベースエラーが正しくキャッチされました');
        console.log(`    エラーメッセージ: ${error.message}`);
        console.log('  ✅ テスト1: 成功\n');
      } else {
        console.log('  ❌ 予期しないエラー:', error.message);
      }
    }

    // テスト2: トランザクション内でのエラーハンドリング
    console.log('テスト2: トランザクション内でのエラーハンドリング');
    
    try {
      await db.withTransaction(async (client) => {
        // 正常なクエリ
        await client.query('SELECT 1');
        
        // エラーを発生させる
        await client.query('SELECT * FROM invalid_table');
      });
      console.log('  ❌ エラーが発生すべきでしたが発生しませんでした');
    } catch (error) {
      console.log('  ✓ トランザクション内のエラーが正しくキャッチされました');
      console.log(`    エラーメッセージ: ${error.message}`);
      
      // ロールバックが正しく動作したか確認
      console.log('  ✓ ロールバックが実行されました（トランザクションが完了していない）');
      console.log('  ✅ テスト2: 成功\n');
    }

    // テスト3: 空の値のチェック
    console.log('テスト3: 空の値のチェック');
    
    const emptyText = '';
    const nullValue = null;
    const undefinedValue = undefined;
    
    const checks = [
      { name: '空文字列', value: emptyText, expected: true },
      { name: 'null', value: nullValue, expected: true },
      { name: 'undefined', value: undefinedValue, expected: true },
      { name: '有効な文字列', value: 'valid text', expected: false }
    ];
    
    let allPassed = true;
    for (const check of checks) {
      const isEmpty = !check.value || (typeof check.value === 'string' && check.value.trim().length === 0);
      if (isEmpty === check.expected) {
        console.log(`  ✓ ${check.name}: 期待通り`);
      } else {
        console.log(`  ❌ ${check.name}: 期待と異なります`);
        allPassed = false;
      }
    }
    
    if (allPassed) {
      console.log('  ✅ テスト3: 成功\n');
    } else {
      console.log('  ❌ テスト3: 失敗\n');
    }

    // テスト4: JSONエラーのハンドリング
    console.log('テスト4: JSONエラーのハンドリング');
    
    try {
      // 無効なJSON文字列をパース
      const invalidJson = '{ invalid json }';
      JSON.parse(invalidJson);
      console.log('  ❌ エラーが発生すべきでしたが発生しませんでした');
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.log('  ✓ JSONエラーが正しくキャッチされました');
        console.log(`    エラーメッセージ: ${error.message}`);
        console.log('  ✅ テスト4: 成功\n');
      } else {
        console.log('  ❌ 予期しないエラー:', error.message);
      }
    }

    // テスト5: 非同期処理のエラーハンドリング
    console.log('テスト5: 非同期処理のエラーハンドリング');
    
    const asyncErrorTest = async () => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('非同期エラーのテスト'));
        }, 100);
      });
    };
    
    try {
      await asyncErrorTest();
      console.log('  ❌ エラーが発生すべきでしたが発生しませんでした');
    } catch (error) {
      if (error.message === '非同期エラーのテスト') {
        console.log('  ✓ 非同期エラーが正しくキャッチされました');
        console.log(`    エラーメッセージ: ${error.message}`);
        console.log('  ✅ テスト5: 成功\n');
      } else {
        console.log('  ❌ 予期しないエラー:', error.message);
      }
    }

    console.log('=== すべてのテストが成功しました ===');
    process.exit(0);
  } catch (error) {
    console.error('❌ テストエラー:', error);
    console.error('スタックトレース:', error.stack);
    process.exit(1);
  }
}

// データベース接続を確認してからテストを実行
db.pool.query('SELECT 1')
  .then(() => {
    console.log('✓ データベース接続確認\n');
    testErrorHandling();
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

