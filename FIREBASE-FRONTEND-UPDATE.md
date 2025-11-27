# フロントエンドFirebase設定更新手順

## 問題

現在、フロントエンドの`firebase.js`が古いFirebaseプロジェクト（`project-management-app-1517f`）の設定を使用しています。
新しいFirebaseプロジェクト（`project-management-app-c1f78`）の設定に更新する必要があります。

## 解決方法

### 1. Firebase ConsoleでWebアプリの設定を取得

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. プロジェクト `project-management-app-c1f78` を選択
3. 「⚙️ プロジェクトの設定」をクリック
4. 「マイアプリ」セクションまでスクロール
5. Webアプリが既に登録されている場合は、その設定を確認
6. Webアプリが登録されていない場合は：
   - 「</>」アイコン（Webアプリを追加）をクリック
   - アプリのニックネームを入力（例: `project-management-app-web`）
   - 「このアプリのFirebase Hostingも設定します」はチェックしない
   - 「アプリを登録」をクリック
7. 表示された設定情報をコピー

設定情報の例：
```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "project-management-app-c1f78.firebaseapp.com",
  projectId: "project-management-app-c1f78",
  storageBucket: "project-management-app-c1f78.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

### 2. フロントエンド設定ファイルを更新

取得した設定情報で`app/frontend/src/firebase.js`を更新してください。

### 3. Authentication（認証）を有効化

1. Firebase Console > Authentication
2. 「始める」をクリック（初回のみ）
3. 「Sign-in method」タブを選択
4. 「メール/パスワード」を有効化
   - 「メール/パスワード」をクリック
   - 「有効にする」をON
   - 「保存」をクリック

### 4. フロントエンドを再ビルド・デプロイ

```bash
# ローカルで確認
cd app/frontend
npm start

# ビルド
npm run build

# デプロイ（GitHubにプッシュ）
git add app/frontend/src/firebase.js
git commit -m "Update Firebase frontend configuration"
git push origin main
```

## 現在の設定（古い）

```javascript
// app/frontend/src/firebase.js（現在）
const firebaseConfig = {
  apiKey: "AIzaSyDVqlrEpda2Tqa8VHfDD56hMFkcbfRkejM",
  authDomain: "project-management-app-1517f.firebaseapp.com",
  projectId: "project-management-app-1517f",
  storageBucket: "project-management-app-1517f.firebasestorage.app",
  messagingSenderId: "498773285957",
  appId: "1:498773285957:web:a682697f4719280926172c"
};
```

## 新しい設定（更新が必要）

Firebase Consoleから取得した新しい設定情報で上記を置き換えてください。

