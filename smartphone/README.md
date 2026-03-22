# スマホ用Webアプリ（BLE iBeacon モニター + YouTube Live 配信）

## 概要
スマホのブラウザで動作するWebアプリです。
サンワサプライ 400-MMBLEBC9P3 BLEビーコンのiBeacon信号を検知し、YouTube Liveで自動配信を開始します。

## 対応環境

| プラットフォーム | ブラウザ | BLE検知 | 状態 |
|---------------|---------|---------|------|
| **Android** | Chrome | ✅ 対応 | フル機能 |
| **iPhone** | **Bluefy** | ✅ 対応 | フル機能 |
| **iPhone** | Safari | ❌ 非対応 | PC経由のみ |

## 🚀 セットアップ（スマホだけでOK）

### ステップ1: GitHub Pages にデプロイ

1. GitHubに `pig-live` リポジトリを作成（Publicにする）
2. コードをプッシュ：
```bash
cd ~/Desktop/pig-live
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/あなたのユーザー名/pig-live.git
git branch -M main
git push -u origin main
```
3. GitHubリポジトリページの **Settings** → 左メニュー **Pages** を開く
4. **Source** → **Deploy from a branch** を選択
5. **Branch** → `main` / `/ (root)` を選択して **Save**
6. 数分後、以下のURLで公開されます：
```
https://あなたのユーザー名.github.io/pig-live/smartphone/
```

### ステップ2: iPhone で開く

1. App Store で **「Bluefy – Web BLE Browser」** をインストール
   - https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055
2. Bluefy で上のGitHub PagesのURLを開く
3. **「🍎 iPhone」** ボタンをタップ → **「監視開始」** が表示される
4. 「監視開始」タップ → BLEスキャン → ビーコン検知 → YouTube配信！

> 💡 **PC不要！** 農場ではiPhone + Bluefy だけで完結します。

### 参考: ローカルで開発・テストする場合
```bash
cd smartphone
python3 -m http.server 8080
# ブラウザで http://localhost:8080 を開く
```

### 代替: Safari + PC経由（Pushcut通知方式）

Safariでは Web Bluetooth が使えないため、PCで検知してiPhoneに通知する方式になります。

1. PC/Raspberry Pi で `receiver/ble_monitor.py` を実行
2. iPhone に **Pushcut** アプリをインストール
3. `ble_monitor.py` の `WEBHOOK_URL` に Pushcut の URL を設定
4. ビーコン検知時 → iPhone に通知 → YouTube アプリを開く

## YouTube Live API の設定

Google APIを利用するため、以下の手順でクライアントIDを取得します。

### ステップ1: OAuth 同意画面の設定（初回のみ）
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、プロジェクトを作成します。
2. 左メニューから「APIとサービス」→ **「OAuth 同意画面（または Google Auth Platform）」** を開きます。
3. User Type で **「外部 (External)」** を選んで「作成」をクリック。
4. 必須項目（アプリ名「豚ライブ配信」、ユーザーサポートメール、デベロッパーの連絡先情報）を埋めて「保存して次へ」。
5. スコープやテストユーザーはそのまま「保存して次へ」で進め、最後まで完了させます。
6. （任意）ダッシュボードに戻り、「アプリを公開 (Publish App)」をクリックして本番環境状態にすると、毎回警告が出なくなります。

### ステップ2: APIの有効化とクライアントID作成
1. 「APIとサービス」→「ライブラリ」から **YouTube Data API v3** を検索し、「有効にする」をクリック。
2. 「APIとサービス」→「認証情報」を開き、上部の **「＋ 認証情報を作成」** → **「OAuth 2.0 クライアント ID」** を選択。
3. アプリケーションの種類: **「ウェブアプリケーション」** を選択。
4. 名前: 「豚ライブスマホ用」などわかりやすい名前。
5. **「承認済みの JavaScript オリジン」** と **「承認済みのリダイレクト URI」** の両方に、以下のURLを追加して「作成」をクリック。
   - `https://あなたのユーザー名.github.io` （オリジン用）
   - `https://あなたのユーザー名.github.io/pig-live/smartphone/` （リダイレクト用）
   - ※ローカルテスト用なら `http://localhost:8080` も追加
6. 作成された **クライアント ID** をコピーし、アプリの設定画面に入力してください！
