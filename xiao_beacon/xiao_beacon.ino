/*
 * XIAO nRF52840 Sense Plus - Bluetooth Beacon for Pig Tracking
 * 
 * このプログラムは、XIAO nRF52840をシンプルなBluetoothビーコンとして動作させます。
 * 豚の首輪に取り付け、常にBLE信号を発信し続けます。
 * 
 * 必要なライブラリ:
 * - ArduinoBLE (Arduino IDEのライブラリマネージャーからインストール)
 */

#include <ArduinoBLE.h>

// ビーコンの識別名（複数の豚を識別する場合は、各XIAOで変更してください）
#define DEVICE_NAME "PIG_BEACON_01"

// ビーコンのUUID（受信機側でこのUUIDを使って識別します）
#define SERVICE_UUID "19B10000-E8F2-537E-4F6C-D104768A1214"

// LED点滅用（動作確認用）
#define LED_BUILTIN LED_BLUE

void setup() {
  Serial.begin(115200);
  
  // LED初期化（動作確認用）
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  
  // BLE初期化
  if (!BLE.begin()) {
    Serial.println("BLE初期化失敗!");
    while (1) {
      // 初期化に失敗した場合はLEDを速く点滅
      digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
      delay(100);
    }
  }
  
  // デバイス名を設定
  BLE.setLocalName(DEVICE_NAME);
  
  // アドバタイズするサービスを設定
  BLE.setAdvertisedService(SERVICE_UUID);
  
  // 送信電力を最大に設定（より遠くまで届くように）
  // 選択肢: -40, -20, -16, -12, -8, -4, 0, 4 (dBm)
  // 4が最大（電池消費も増える）、-40が最小
  BLE.setTxPower(4);
  
  // アドバタイズ開始
  BLE.advertise();
  
  Serial.println("BLEビーコン起動完了");
  Serial.print("デバイス名: ");
  Serial.println(DEVICE_NAME);
  Serial.print("UUID: ");
  Serial.println(SERVICE_UUID);
  Serial.println("ビーコン信号を発信中...");
  
  // 起動完了を示すためにLEDを3回点滅
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(200);
    digitalWrite(LED_BUILTIN, LOW);
    delay(200);
  }
}

void loop() {
  // 定期的にLEDを点滅させて動作中であることを示す
  // （電池節約のため、10秒に1回だけ短く点滅）
  static unsigned long lastBlink = 0;
  unsigned long currentTime = millis();
  
  if (currentTime - lastBlink > 10000) {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(50);
    digitalWrite(LED_BUILTIN, LOW);
    lastBlink = currentTime;
  }
  
  // BLEイベントの処理
  BLE.poll();
  
  // 省電力のため少し待機
  delay(100);
}
