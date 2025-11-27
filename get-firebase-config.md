# Firebase Webアプリ設定の取得方法

## 手順

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. プロジェクト `project-management-app-c1f78` を選択
3. 「⚙️ プロジェクトの設定」をクリック
4. 「マイアプリ」セクションまでスクロール

## Webアプリが既に登録されている場合

- 登録済みのWebアプリの設定を確認
- 「設定」アイコンをクリックして設定情報を表示

## Webアプリが登録されていない場合

1. 「</>」アイコン（Webアプリを追加）をクリック
2. アプリのニックネームを入力（例: `project-management-app-web`）
3. 「このアプリのFirebase Hostingも設定します」はチェックしない
4. 「アプリを登録」をクリック
5. 表示された設定情報をコピー

## 必要な情報

以下の情報を取得してください：

- `apiKey`: "AIza..."
- `authDomain`: "project-management-app-c1f78.firebaseapp.com"（自動）
- `projectId`: "project-management-app-c1f78"（自動）
- `storageBucket`: "project-management-app-c1f78.appspot.com"（自動）
- `messagingSenderId`: "数字"
- `appId`: "1:数字:web:文字列"

## 設定ファイルの更新

取得した情報で `app/frontend/src/firebase.js` を更新してください。

