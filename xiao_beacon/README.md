# XIAO nRF52840 Bluetoothビーコン

## 概要
このプログラムは、XIAO nRF52840 Sense PlusをBluetoothビーコンとして動作させます。
豚の首輪に取り付けて使用します。

## 必要な機材
- XIAO nRF52840 Sense Plus
- ボタン電池（CR2032など）またはLiPoバッテリー
- 防水ケース（豚が水に濡れても大丈夫なように）

## セットアップ手順

### 1. Arduino IDEのインストール
1. [Arduino IDE](https://www.arduino.cc/en/software)をダウンロード・インストール
2. Arduino IDEを起動

### 2. XIAO nRF52840のボードサポートを追加
1. Arduino IDE のメニューから「Arduino IDE」→「Settings」を開く
2. 「Additional Boards Manager URLs」に以下を追加:
   ```
   https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json
   ```
3. 「Tools」→「Board」→「Boards Manager」を開く
4. 検索欄に「Seeed nRF52」と入力
5. 「Seeed nRF52 Boards」をインストール

### 3. 必要なライブラリのインストール
1. 「Tools」→「Manage Libraries」を開く
2. 検索欄に「ArduinoBLE」と入力
3. 「ArduinoBLE」をインストール

### 4. プログラムの書き込み
1. XIAOをUSBケーブルでPCに接続
2. 「Tools」→「Board」から「Seeed XIAO nRF52840 Sense」を選択
3. 「Tools」→「Port」から適切なポートを選択
4. `xiao_beacon.ino`を開く
5. 必要に応じて`DEVICE_NAME`を変更（複数の豚を識別する場合）
6. 「Upload」ボタンをクリック

### 5. 動作確認
- 書き込みが成功すると、青色LEDが3回点滅します
- その後、10秒ごとに短く点滅し続けます（動作中の証）

## 複数の豚を識別する場合
複数の豚を個別に追跡する場合は、各XIAOで以下の行を変更してください：

```cpp
#define DEVICE_NAME "PIG_BEACON_01"  // "PIG_BEACON_02", "PIG_BEACON_03" など
```

## バッテリー駆動時間の目安
- CR2032ボタン電池: 約1〜2日
- 600mAh LiPoバッテリー: 約1週間
- より長時間動作させたい場合は、送信電力を下げるか、送信間隔を長くする必要があります

## トラブルシューティング
- **書き込みエラー**: ダブルクリックでリセットしてからもう一度試してください
- **BLE初期化失敗**: LEDが速く点滅し続けます。USBケーブルを抜き差ししてください
- **検出されない**: 送信電力が低い可能性があります。`BLE.setTxPower(4)`の値を確認してください
