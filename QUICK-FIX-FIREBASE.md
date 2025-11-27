# Firebase APIキーエラー修正手順

## エラー内容
```
Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.)
```

## 原因
フロントエンドの`firebase.js`が古いFirebaseプロジェクト（`project-management-app-1517f`）の設定を使用しています。
新しいFirebaseプロジェクト（`project-management-app-c1f78`）の設定に更新する必要があります。

## 解決方法

### ステップ1: Firebase ConsoleでWebアプリ設定を取得

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. プロジェクト `project-management-app-c1f78` を選択
3. 「⚙️ プロジェクトの設定」をクリック
4. 「マイアプリ」セクションを確認

**Webアプリが既に登録されている場合:**
- 登録済みのWebアプリの「設定」アイコンをクリック
- 表示された設定情報をコピー

**Webアプリが登録されていない場合:**
- 「</>」アイコン（Webアプリを追加）をクリック
- アプリのニックネームを入力（例: `project-management-app-web`）
- 「このアプリのFirebase Hostingも設定します」はチェックしない
- 「アプリを登録」をクリック
- 表示された設定情報をコピー

### ステップ2: firebase.jsを更新

取得した設定情報で`app/frontend/src/firebase.js`を更新してください。

**現在の設定（古い）:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDVqlrEpda2Tqa8VHfDD56hMFkcbfRkejM",
  authDomain: "project-management-app-1517f.firebaseapp.com",
  projectId: "project-management-app-1517f",
  storageBucket: "project-management-app-1517f.firebasestorage.app",
  messagingSenderId: "498773285957",
  appId: "1:498773285957:web:a682697f4719280926172c"
};
```

**新しい設定（更新後）:**
```javascript
const firebaseConfig = {
  apiKey: "YOUR_NEW_API_KEY", // Firebase Consoleから取得
  authDomain: "project-management-app-c1f78.firebaseapp.com",
  projectId: "project-management-app-c1f78",
  storageBucket: "project-management-app-c1f78.appspot.com",
  messagingSenderId: "YOUR_NEW_MESSAGING_SENDER_ID", // Firebase Consoleから取得
  appId: "YOUR_NEW_APP_ID" // Firebase Consoleから取得
};
```

### ステップ3: Authenticationを有効化

1. Firebase Console > Authentication
2. 「始める」をクリック（初回のみ）
3. 「Sign-in method」タブを選択
4. 「メール/パスワード」を有効化
   - 「メール/パスワード」をクリック
   - 「有効にする」をON
   - 「保存」をクリック

### ステップ4: フロントエンドを再ビルド・デプロイ

```bash
# ローカルで確認
cd app/frontend
npm start

# ビルド
npm run build

# デプロイ（GitHubにプッシュ）
git add app/frontend/src/firebase.js
git commit -m "Update Firebase frontend configuration to new project"
git push origin main
```

## 注意事項

- `apiKey`、`messagingSenderId`、`appId`はFirebase Consoleから取得する必要があります
- `authDomain`、`projectId`、`storageBucket`は新しいプロジェクトID（`project-management-app-c1f78`）から自動的に設定できます
- 設定を更新したら、必ずAuthenticationでメール/パスワード認証を有効化してください

