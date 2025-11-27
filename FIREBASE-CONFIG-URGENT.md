# 🔴 緊急: Firebase設定の更新が必要です

## 現在の状況

`app/frontend/src/firebase.js`が新しいプロジェクトID（`project-management-app-c1f78`）に更新されましたが、以下の3つの値がまだ設定されていません：

- `apiKey`: "YOUR_API_KEY_HERE"
- `messagingSenderId`: "YOUR_MESSAGING_SENDER_ID"
- `appId`: "YOUR_APP_ID"

## 即座に実行する手順

### 1. Firebase Consoleで設定を取得（5分）

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. プロジェクト `project-management-app-c1f78` を選択
3. 「⚙️ プロジェクトの設定」をクリック
4. 「マイアプリ」セクションを確認

**Webアプリが既に登録されている場合:**
- 登録済みのWebアプリの「設定」アイコン（⚙️）をクリック
- 表示された設定情報をコピー

**Webアプリが登録されていない場合:**
- 「</>」アイコン（Webアプリを追加）をクリック
- アプリのニックネーム: `project-management-app-web`
- 「このアプリのFirebase Hostingも設定します」は**チェックしない**
- 「アプリを登録」をクリック
- 表示された設定情報をコピー

### 2. firebase.jsを更新

取得した設定情報で以下の3つの値を更新：

```javascript
// app/frontend/src/firebase.js
const firebaseConfig = {
  apiKey: "取得したAPIキー", // 例: "AIzaSy..."
  authDomain: "project-management-app-c1f78.firebaseapp.com", // 既に設定済み
  projectId: "project-management-app-c1f78", // 既に設定済み
  storageBucket: "project-management-app-c1f78.appspot.com", // 既に設定済み
  messagingSenderId: "取得したMessaging Sender ID", // 例: "123456789012"
  appId: "取得したApp ID" // 例: "1:123456789012:web:abcdef..."
};
```

### 3. Authenticationを有効化

1. Firebase Console > Authentication
2. 「始める」をクリック（初回のみ）
3. 「Sign-in method」タブ
4. 「メール/パスワード」をクリック
5. 「有効にする」をON
6. 「保存」をクリック

### 4. フロントエンドを再起動

```bash
cd app/frontend
npm start
```

## 設定情報の取得例

Firebase Consoleで表示される設定情報の例：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz",
  authDomain: "project-management-app-c1f78.firebaseapp.com",
  projectId: "project-management-app-c1f78",
  storageBucket: "project-management-app-c1f78.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

この情報を`app/frontend/src/firebase.js`にコピーしてください。

## 確認方法

設定を更新したら、ブラウザでアプリを開いてログインを試してください。エラーが解消されれば成功です。

