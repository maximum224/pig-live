# 🐷 豚の接近検知システム - Pig Live Streaming System

サンワサプライ 400-MMBLEBC9P3 BLEビーコンを使用して、豚が餌場に近づいたことを自動検知し、OBSで配信を開始するシステムです。

## 🎯 システム概要

### 仕組み
1. **豚に取り付け**: 400-MMBLEBC9P3 ビーコンを豚の首輪に装着
2. **電波を発信**: ビーコンが常にiBeacon信号を発信
3. **餌場で監視**: 餌場付近の受信機（PC/Raspberry Pi）が電波強度（RSSI）を測定
4. **接近を検知**: 電波強度が閾値を超えたら「餌場に近づいた」と判定
5. **配信開始**: 自動的にOBSで配信を開始

### システム構成
```
🐷 豚（ビーコン装着）  →→→  iBeacon電波  →→→  📡 受信機  →  💻 OBS配信開始
  首輪に取り付け            RSSI測定           PC/RasPi        自動配信
```

### 使用ビーコン
- **サンワサプライ 400-MMBLEBC9P3**
  - iBeacon / Eddystone 対応
  - IP65 防塵・防滴（屋外設置OK）
  - 電波到達距離: 約1〜100m（8段階設定）
  - 電池: CR2477（最大約3年）
  - 専用アプリで設定変更可能

## 📁 プロジェクト構成

```
pig-live/
├── smartphone/           # スマホ用Webアプリ（HTML/CSS/JS）
│   ├── index.html        # ダッシュボード
│   ├── style.css         # スタイルシート
│   ├── app.js            # BLEスキャン・YouTube Live連携
│   └── README.md         # スマホ版セットアップ手順
│
├── receiver/             # PC用プログラム（Python + OBS）
│   ├── ble_monitor.py    # iBeacon RSSI監視・OBS制御プログラム
│   ├── requirements.txt  # Pythonパッケージ
│   └── README.md         # 受信機のセットアップ手順
│
├── xiao_beacon/          # （旧）XIAO用プログラム - 現在は使用しません
│   ├── xiao_beacon.ino   # （旧）Bluetoothビーコンプログラム
│   └── README.md         # （旧）XIAOのセットアップ手順
│
└── README.md            # このファイル
```

## 🚀 クイックスタート

### 必要な機材
- **送信機側**: サンワサプライ 400-MMBLEBC9P3 BLEビーコン + CR2477電池
- **受信機側（2つの方式から選択）**:
  - **📱 スマホ版**: Android スマートフォン（Chrome） → `smartphone/` を使用
  - **💻 PC版**: PC/Raspberry Pi + OBS Studio → `receiver/` を使用

### セットアップ手順

#### ステップ1: ビーコンの設定
1. サンワサプライの専用アプリ（iOS/Android）をインストール
2. ビーコンの電源を入れ、アプリで接続
3. iBeaconスロットの UUID / Major / Minor を確認・設定
4. 電波到達距離と発信間隔を環境に合わせて調整
5. 豚の首輪にビーコンを取り付ける（IP65防水なので屋外OK）

#### ステップ2: 受信機のセットアップ
1. [receiver/README.md](receiver/README.md) の手順に従ってセットアップ
2. Pythonパッケージをインストール
3. OBS WebSocketを設定
4. ビーコンの UUID / Major / Minor に合わせて設定値を編集

#### ステップ3: 動作確認
1. 受信機プログラムを起動
   ```bash
   cd receiver
   python3 ble_monitor.py
   ```
2. ビーコンを持って餌場に近づく
3. 自動的にOBS配信が開始されることを確認

## ⚙️ 設定のカスタマイズ

### 距離の調整
[receiver/ble_monitor.py](receiver/ble_monitor.py) の `RSSI_THRESHOLD` を変更：

```python
RSSI_THRESHOLD = -60  # デフォルト（5m前後）
RSSI_THRESHOLD = -50  # より近くでしか反応しない（2〜3m）
RSSI_THRESHOLD = -70  # より遠くでも反応する（10m前後）
```

### 複数の豚を識別
各ビーコンに異なる Major / Minor を設定：

**ビーコン側**（専用アプリで設定）:
- 豚1号: Major=1, Minor=1
- 豚2号: Major=1, Minor=2

**受信機側** ([receiver/ble_monitor.py](receiver/ble_monitor.py)):
```python
IBEACON_MAJOR = 1   # 監視対象のMajor
IBEACON_MINOR = 1   # 監視対象のMinor
```

## 📊 RSSI値の目安

| RSSI値 | 距離 | 用途 |
|--------|------|------|
| -30〜-50 | 0〜2m | 餌箱の直前での検知 |
| -50〜-60 | 2〜5m | 餌場エリアへの接近検知（推奨） |
| -60〜-70 | 5〜10m | 広い餌場エリア全体の監視 |
| -70〜-80 | 10〜15m | 遠距離からの接近検知 |

※ 実際の環境（障害物、電波干渉など）により変動します

## 🔋 バッテリー持続時間

### 400-MMBLEBC9P3（送信機）
- CR2477電池: 最大約3年（発信間隔・電波強度の設定による）
- 発信間隔を長く、電波強度を低くすると長持ちします

### バッテリー持続の目安
| 発信間隔 | 電波強度 | 持続時間の目安 |
|----------|----------|----------------|
| 1000ms | 低 | 約2〜3年 |
| 500ms | 中 | 約1〜2年 |
| 100ms | 高 | 約数ヶ月 |

## 🛠️ トラブルシューティング

### よくある問題と解決法

| 問題 | 原因 | 解決法 |
|------|------|--------|
| ビーコンが検出されない | 電源OFF / 電池切れ | 電源確認、CR2477電池交換 |
| UUID/Major/Minorが不一致 | 設定ミス | 専用アプリで確認・修正 |
| RSSI値が不安定 | 障害物が多い | 検知回数の閾値を上げる |
| 誤検知が多い | 閾値が高すぎる | RSSI_THRESHOLDを下げる（例: -70） |
| 配信が始まらない | OBS未接続 | OBS WebSocket設定を確認 |

詳細は各ディレクトリのREADME.mdを参照してください。

## 📈 将来の拡張アイデア

- [ ] 複数の豚を同時監視（複数のMajor/Minorをスキャン）
- [ ] 滞在時間の記録（何分間餌場にいたか）
- [ ] Webダッシュボードでリアルタイム表示
- [ ] LINEやメールで通知
- [ ] 温度・湿度センサーの追加
- [ ] 位置情報の記録（複数の受信機で三角測量）

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🙏 謝辞

- サンワサプライ - 400-MMBLEBC9P3 BLEビーコン
- Bleak Python Library
- OBS Studio

## 📮 サポート

質問や問題がある場合は、各README.mdのトラブルシューティングセクションを参照してください。

---

**Happy Pig Streaming! 🐷📹**
