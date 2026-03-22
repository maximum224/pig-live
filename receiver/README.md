# 受信機プログラム（BLE iBeacon RSSI Monitor）

## 概要
このプログラムは、サンワサプライ 400-MMBLEBC9P3 BLEビーコンからのiBeacon信号を監視し、電波強度（RSSI）に基づいて豚の接近を検知します。
豚が餌場に近づいたら、自動的にOBSで配信を開始します。

## 動作環境
- macOS / Linux / Windows
- Python 3.7以上
- OBS Studio（WebSocketプラグイン有効）

## セットアップ手順

### 1. Pythonのインストール確認
ターミナルで以下のコマンドを実行してPythonがインストールされているか確認：
```bash
python3 --version
```

### 2. 必要なパッケージのインストール
このディレクトリで以下のコマンドを実行：
```bash
pip3 install -r requirements.txt
```

### 3. ビーコン（400-MMBLEBC9P3）の設定
1. サンワサプライの専用アプリ（iOS/Android）をインストール
2. ビーコンの電源を入れ、アプリでビーコンに接続
3. iBeaconフォーマットのスロットを設定：
   - **UUID**: 任意の値（デフォルト値のままでもOK）
   - **Major**: 豚ごとに異なる番号を設定（例: 1, 2, 3...）
   - **Minor**: 識別用の番号を設定
4. 設定した UUID / Major / Minor の値をメモしておく

### 4. OBS WebSocketの設定
1. OBS Studioを起動
2. メニューから「ツール」→「WebSocketサーバー設定」を開く
3. 「WebSocketサーバーを有効にする」にチェック
4. ポート番号を確認（デフォルト: 4455）
5. パスワードを設定している場合はメモしておく

### 5. プログラムの設定
`ble_monitor.py`の設定部分を編集：

```python
# iBeacon の識別情報（ビーコンの専用アプリで設定した値に合わせる）
IBEACON_UUID = "FDA50693-A4E2-4FB1-AFCF-C0BDB8E57A95"
IBEACON_MAJOR = 1
IBEACON_MINOR = 1

# 距離判定の閾値
RSSI_THRESHOLD = -60  # 数値を大きくすると近くでしか反応しない、小さくすると遠くでも反応

# OBS設定
OBS_HOST = "localhost"  # OBSが別のPCにある場合はIPアドレスを指定
OBS_PORT = 4455
OBS_PASSWORD = ""  # パスワードを設定している場合は入力
```

## 使い方

### プログラムの起動
```bash
python3 ble_monitor.py
```

### 動作確認
1. プログラムを起動すると、BLEデバイスのスキャンが始まります
2. 400-MMBLEBC9P3がiBeacon信号を発信していると、RSSI値とともに表示されます
3. 豚が餌場に近づく（RSSI値が閾値を超える）と、自動的にOBS配信が開始されます

### 表示される情報
```
📌 iBeacon検出 [Major:1 Minor:1] - RSSI: -75 dBm  ← 遠い
📍 iBeacon検出 [Major:1 Minor:1] - RSSI: -55 dBm  ← 近い（閾値超過）
   ⚠️  閾値超過 (1/3)
```

## RSSI値の目安
| RSSI値 | 距離の目安 | 備考 |
|--------|-----------|------|
| -30〜-50 | 0〜2m | 非常に近い |
| -50〜-60 | 2〜5m | 近い（デフォルト設定） |
| -60〜-70 | 5〜10m | やや遠い |
| -70〜-80 | 10〜15m | 遠い |
| -80以下 | 15m以上 | 非常に遠い |

※ 環境により変動します。実際の現場でテストして調整してください。
※ 400-MMBLEBC9P3 は電波到達距離を約1〜100mで8段階に設定可能です。専用アプリで調整してください。

## 設定のカスタマイズ

### 検知感度の調整
```python
# より近くでしか反応しないようにする
RSSI_THRESHOLD = -50  # -60 → -50に変更

# より遠くでも反応するようにする
RSSI_THRESHOLD = -70  # -60 → -70に変更
```

### 誤検知防止の調整
```python
# より慎重に判定（5回連続で閾値を超えたら確定）
DETECTION_COUNT_THRESHOLD = 5  # 3 → 5に変更

# すぐに反応（1回で確定）
DETECTION_COUNT_THRESHOLD = 1  # 3 → 1に変更
```

### 自動停止の有効化
豚が離れたら自動的に配信を停止したい場合は、以下の行のコメントを外してください：
```python
# if is_streaming:
#     logger.info("\n豚が離れました。配信を停止します。\n")
#     stop_obs_streaming()
```
↓
```python
if is_streaming:
    logger.info("\n豚が離れました。配信を停止します。\n")
    stop_obs_streaming()
```

## 複数の豚を監視する場合
各豚のビーコンに異なる Major/Minor を設定し、プログラムを複数起動するか、
プログラムを改造して複数の Major/Minor を監視するようにしてください。

## トラブルシューティング

### ビーコンが見つからない
- 400-MMBLEBC9P3 の電源が入っているか確認（電源ON/OFF機能あり）
- ビーコンのiBeaconスロットが有効になっているか確認
- UUID / Major / Minor がプログラムの設定値と一致しているか確認
- Bluetoothが有効になっているか確認
- ビーコンの電池（CR2477）が切れていないか確認

### OBSに接続できない
- OBS WebSocketが有効になっているか確認
- ポート番号が正しいか確認
- パスワードが正しいか確認
- ファイアウォールでブロックされていないか確認

### RSSI値が安定しない
- 障害物が多い環境では値が変動しやすい
- `DETECTION_COUNT_THRESHOLD`を増やして誤検知を減らす
- `SCAN_INTERVAL`を調整してスキャン頻度を変更
- ビーコンの発信電力を専用アプリで調整

## 自動起動の設定（オプション）
Raspberry Piなどで起動時に自動実行したい場合は、systemdサービスとして登録するか、
cronの@rebootを使用してください。
