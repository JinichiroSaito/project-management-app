#!/usr/bin/env node
/**
 * プロジェクトのreviewer_approvalsの状態を確認するスクリプト
 * 使用方法: node scripts/check-reviewer-approvals.js <project_id>
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function checkReviewerApprovals(projectId) {
  try {
    console.log(`\n=== プロジェクト ${projectId} のreviewer_approvalsの状態を確認 ===\n`);
    
    // プロジェクト情報を取得
    const projectResult = await pool.query(
      'SELECT id, name, application_status, reviewer_approvals, final_approver_user_id, requested_amount, created_at, updated_at FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectResult.rows.length === 0) {
      console.error(`プロジェクト ${projectId} が見つかりません`);
      process.exit(1);
    }
    
    const project = projectResult.rows[0];
    console.log('プロジェクト情報:');
    console.log(`  ID: ${project.id}`);
    console.log(`  名前: ${project.name}`);
    console.log(`  申請ステータス: ${project.application_status}`);
    console.log(`  申請金額: ${project.requested_amount}`);
    console.log(`  最終承認者ID: ${project.final_approver_user_id}`);
    console.log(`  作成日時: ${project.created_at}`);
    console.log(`  更新日時: ${project.updated_at}`);
    
    // reviewer_approvalsの生データを表示
    console.log('\nreviewer_approvals (JSONB):');
    console.log(JSON.stringify(project.reviewer_approvals, null, 2));
    
    // キーと値の詳細を表示
    const approvals = project.reviewer_approvals || {};
    console.log('\nキーと値の詳細:');
    Object.entries(approvals).forEach(([key, value]) => {
      console.log(`  キー: "${key}" (型: ${typeof key})`);
      console.log(`    値: ${JSON.stringify(value)}`);
      console.log(`    status: ${value?.status || 'undefined'}`);
      console.log(`    review_comment: ${value?.review_comment || 'null'}`);
      console.log(`    updated_at: ${value?.updated_at || 'null'}`);
      console.log('');
    });
    
    // 審査者情報を取得
    const reviewersResult = await pool.query(
      `SELECT pr.reviewer_id, u.id, u.name, u.email
       FROM project_reviewers pr
       JOIN users u ON u.id = pr.reviewer_id
       WHERE pr.project_id = $1
       ORDER BY pr.reviewer_id`,
      [projectId]
    );
    
    console.log('割り当てられた審査者:');
    reviewersResult.rows.forEach((reviewer) => {
      const reviewerId = reviewer.reviewer_id;
      const stringKey = String(reviewerId);
      const approval = approvals[stringKey] || approvals[reviewerId] || approvals[Number(reviewerId)] || null;
      
      console.log(`  ID: ${reviewerId}, 名前: ${reviewer.name}, メール: ${reviewer.email}`);
      if (approval) {
        console.log(`    承認状態: ${approval.status || 'undefined'}`);
        console.log(`    コメント: ${approval.review_comment || 'null'}`);
        console.log(`    更新日時: ${approval.updated_at || 'null'}`);
      } else {
        console.log(`    承認状態: 未設定 (pending)`);
      }
      console.log('');
    });
    
    // approval_routesを確認
    const routeResult = await pool.query(
      'SELECT * FROM approval_routes WHERE amount_threshold = $1',
      [project.requested_amount >= 100000000 ? '>=100m' : '<100m']
    );
    
    if (routeResult.rows.length > 0) {
      const route = routeResult.rows[0];
      console.log('承認ルート情報:');
      console.log(`  金額閾値: ${route.amount_threshold}`);
      console.log(`  審査者IDs: ${JSON.stringify(route.reviewer_ids)}`);
      console.log(`  最終承認者ID: ${route.final_approver_user_id}`);
    }
    
    console.log('\n=== 確認完了 ===\n');
    
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const projectId = process.argv[2];
if (!projectId) {
  console.error('使用方法: node scripts/check-reviewer-approvals.js <project_id>');
  process.exit(1);
}

checkReviewerApprovals(parseInt(projectId));

