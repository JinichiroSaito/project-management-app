# Firebase再設定手順

## 1. Firebase Consoleで新しいプロジェクトを作成

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `project-management-app-new`）
4. Google Analyticsの設定（任意）
5. プロジェクトを作成

## 2. Webアプリを追加して設定を取得

1. Firebase Consoleで作成したプロジェクトを選択
2. 左メニューから「⚙️ プロジェクトの設定」をクリック
3. 「マイアプリ」セクションまでスクロール
4. 「</>」アイコン（Webアプリを追加）をクリック
5. アプリのニックネームを入力（例: `project-management-app-web`）
6. 「このアプリのFirebase Hostingも設定します」はチェックしない
7. 「アプリを登録」をクリック
8. 表示された設定情報をコピー（以下の形式）:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

## 3. Authentication（認証）を有効化

1. 左メニューから「Authentication」をクリック
2. 「始める」をクリック
3. 「Sign-in method」タブを選択
4. 「メール/パスワード」を有効化
   - 「メール/パスワード」をクリック
   - 「有効にする」をON
   - 「保存」をクリック

## 4. サービスアカウントキーの取得

1. Firebase Consoleで「⚙️ プロジェクトの設定」をクリック
2. 「サービスアカウント」タブを選択
3. 「新しい秘密鍵の生成」をクリック
4. JSONファイルがダウンロードされる（`firebase-adminsdk-xxxxx-xxxxx.json`）
5. このファイルを`firebase-service-account.json`として保存

## 5. 設定ファイルの更新

### フロントエンド設定 (`app/frontend/src/firebase.js`)

取得した設定情報で`firebase.js`を更新:

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

### バックエンド設定

#### ローカル開発環境

1. ダウンロードしたサービスアカウントキーを`firebase-service-account.json`として保存
2. このファイルは`.gitignore`に含まれているため、Gitにはコミットされません

#### GCP Secret Manager（本番環境）

1. サービスアカウントキーのJSONファイルの内容を取得
2. Secret Managerに保存:

```bash
# サービスアカウントキーの内容をSecret Managerに保存
gcloud secrets create firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp

# または既存のシークレットを更新
gcloud secrets versions add firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp
```

## 6. 既存ユーザーの移行（オプション）

既存のユーザーデータがある場合、Firebase Authenticationに手動でユーザーを再作成する必要があります。

1. Firebase Console > Authentication > Users
2. 「ユーザーを追加」から既存ユーザーのメールアドレスとパスワードを設定
3. または、ユーザーに再登録してもらう

## 7. 動作確認

1. フロントエンドを起動してログイン/サインアップが動作するか確認
2. バックエンドのログでFirebase初期化が成功しているか確認

## トラブルシューティング

### エラー: "Firebase: Error (auth/configuration-not-found)"
- `firebase.js`の設定が正しいか確認
- プロジェクトIDが正しいか確認

### エラー: "Failed to initialize Firebase Admin SDK"
- サービスアカウントキーが正しいか確認
- Secret Managerのシークレット名が正しいか確認

### 認証が動作しない
- Authenticationでメール/パスワード認証が有効になっているか確認
- ブラウザのコンソールでエラーを確認

