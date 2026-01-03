# バックエンドロジック問題分析レポート

## 問題の概要

審査員（ユーザーID: 222, masakazu.yoshida@asahigroup-holdings.com）が承認した場合、承認情報が`finalApprovals`から消えてしまい、データベースに保存されない問題が発生しています。

## ログ分析結果

### 最新のログ（2026-01-03 04:28:33）

1. **`updatedApprovals`には`'222'`が含まれている**
   ```
   updatedApprovals: {
     '221': { status: 'pending', updated_at: null },
     '222': { status: 'approved', review_comment: null, updated_at: '2026-01-03T04:28:33.814Z' },
     '224': { status: 'pending', updated_at: null }
   }
   ```

2. **`dbApprovalsBeforeUpdate`には`'222'`が含まれていない**
   ```
   dbApprovalsBeforeUpdate: {
     '221': { status: 'pending', updated_at: null },
     '224': { status: 'pending', updated_at: null }
   }
   ```

3. **`latestReviewerApprovals`には`'222'`が含まれていない**
   ```
   latestReviewerApprovals: {
     '221': { status: 'pending', updated_at: null },
     '224': { status: 'pending', updated_at: null }
   }
   ```

4. **`finalApprovals`から`'222'`が消えている**
   ```
   finalApprovals: {
     '221': { status: 'pending', updated_at: null },
     '224': { status: 'pending', updated_at: null }
   }
   finalApprovalsKeys: [ '221', '224' ]
   finalApprovalsUserIdKey: undefined
   hasUserIdKey: false
   ```

5. **データベースに保存された結果も`'222'`が含まれていない**
   ```
   savedApprovals: {
     '221': { status: 'pending', updated_at: null },
     '224': { status: 'pending', updated_at: null }
   }
   ```

## コードフロー分析

### 1. `reviewer-approve`エンドポイントの処理フロー

```
1. プロジェクト情報を取得
   ↓
2. savedReviewerApprovalsを保存
   ↓
3. beforeEnsureRouteResultから最新のreviewer_approvalsを取得
   ↓
4. mergedApprovals = { ...savedReviewerApprovals, ...latestReviewerApprovalsBeforeRoute }
   ↓
5. ensureProjectRouteを呼び出し
   ↓
6. latestReviewerApprovalsを再取得（ensureProjectRouteの後）
   ↓
7. latestReviewerApprovals = { ...latestReviewerApprovals, ...mergedApprovals }
   ↓
8. currentApprovals = latestReviewerApprovals
   ↓
9. updatedApprovals = { ...currentApprovals, [userIdKey]: { status: 'approved', ... } }
   ↓
10. dbApprovalsBeforeUpdateを再取得
    ↓
11. finalApprovalsを作成
    ↓
12. finalApprovals[userIdKey] = updatedApprovals[userIdKey] を設定
    ↓
13. データベースに保存
```

### 2. 問題の根本原因

**問題点1: `dbApprovalsBeforeUpdate`に`'222'`が含まれていない**

`dbApprovalsBeforeUpdate`は、`updatedApprovals`を作成した**後**にデータベースから取得していますが、この時点ではまだデータベースに`'222'`の承認情報が保存されていないため、`dbApprovalsBeforeUpdate`には`'222'`が含まれていません。

**問題点2: `latestReviewerApprovals`に`'222'`が含まれていない**

`latestReviewerApprovals`は、`ensureProjectRoute`の後にデータベースから取得していますが、この時点でもまだ`'222'`の承認情報がデータベースに保存されていないため、`latestReviewerApprovals`には`'222'`が含まれていません。

**問題点3: `finalApprovals`の作成ロジック**

現在のコード：
```javascript
const latestReviewerApprovalsWithoutCurrentUser = { ...latestReviewerApprovals };
delete latestReviewerApprovalsWithoutCurrentUser[userIdKey];
delete latestReviewerApprovalsWithoutCurrentUser[userId];
delete latestReviewerApprovalsWithoutCurrentUser[String(userId)];

const finalApprovals = { 
  ...dbApprovalsBeforeUpdate,  // '222'が含まれていない
  ...latestReviewerApprovalsWithoutCurrentUser,  // '222'が含まれていない
  ...updatedApprovals  // '222'が含まれている
};

if (updatedApprovals && updatedApprovals[userIdKey]) {
  finalApprovals[userIdKey] = { ...updatedApprovals[userIdKey] };
}
```

理論的には、`...updatedApprovals`で`'222'`が含まれるはずですが、ログを見ると`finalApprovals`から`'222'`が消えています。

**問題点4: `finalApprovals[userIdKey]`の設定が効いていない**

ログを見ると、`After setting userIdKey in finalApprovals`の時点で`finalApprovalsUserIdKey: undefined`となっており、`finalApprovals[userIdKey] = updatedApprovals[userIdKey]`の設定が効いていません。

## 推測される原因

1. **スプレッド演算子の順序の問題**: `...updatedApprovals`が`...latestReviewerApprovalsWithoutCurrentUser`の後に来ているため、何かが上書きしている可能性
2. **オブジェクトの参照の問題**: `finalApprovals`が何らかの理由で変更されている可能性
3. **`latestReviewerApprovalsWithoutCurrentUser`の削除処理**: `delete`操作が正しく機能していない可能性

## 解決策

### 解決策1: `finalApprovals`の作成を簡素化

`dbApprovalsBeforeUpdate`と`latestReviewerApprovals`は、現在のユーザーの承認情報が含まれていないため、これらをベースにする必要はありません。

代わりに、以下のようにします：
1. `updatedApprovals`をベースにする（現在のユーザーの承認情報を含む）
2. 他の審査者の承認情報を`dbApprovalsBeforeUpdate`から取得してマージ
3. 現在のユーザーの承認情報を確実に設定

### 解決策2: `finalApprovals`の作成後に確実に設定

`finalApprovals`を作成した後、必ず`finalApprovals[userIdKey] = updatedApprovals[userIdKey]`を設定し、その後のログで確認する。

### 解決策3: デバッグログの追加

`finalApprovals`の作成前後で、各ステップの内容を詳細にログ出力する。

## 推奨される修正

1. `finalApprovals`の作成ロジックを簡素化
2. `updatedApprovals`をベースにして、他の審査者の情報をマージ
3. 現在のユーザーの承認情報を確実に設定
4. デバッグログを追加して、各ステップの内容を確認

