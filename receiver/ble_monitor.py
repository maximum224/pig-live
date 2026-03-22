#!/usr/bin/env python3
"""
BLE iBeacon RSSI Monitor with OBS Control & Webhook Notification
豚に取り付けたiBeaconビーコン（サンワサプライ 400-MMBLEBC9P3）の接近を検知して
OBSで配信を自動開始、またはWebhook通知（Pushcut等）でiPhoneに通知するプログラム

必要なパッケージ:
- bleak: BLE通信用
- obs-websocket-py: OBS制御用（オプション）
- python 3.7以上

対応ビーコン: サンワサプライ 400-MMBLEBC9P3（iBeacon対応）
"""

import asyncio
import logging
import struct
from datetime import datetime
from bleak import BleakScanner
from obswebsocket import obsws, requests as obs_requests
import json
import urllib.request
import urllib.error
import time

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===== 設定 =====
# iBeacon の識別情報（400-MMBLEBC9P3 の専用アプリで設定した値に合わせてください）
# UUID: ビーコンのグループ識別子（専用アプリで確認・設定）
IBEACON_UUID = "7777772E-6B6B-6D63-6E2E-636F6D000001"

# Major: ビーコンの大分類番号（0〜65535）
# 例: 農場ごとに異なる番号を割り当てる
IBEACON_MAJOR = 1

# Minor: ビーコンの小分類番号（0〜65535）
# 例: 各豚に異なる番号を割り当てる
IBEACON_MINOR = 1

# 距離判定の閾値（RSSI値）
# RSSI値は負の数で、0に近いほど近い
# 目安: -50〜-60 = 数メートル以内、-70〜-80 = 10メートル前後、-90以下 = 遠い
RSSI_THRESHOLD = -60  # この値より大きければ「近い」と判定

# 検知の安定化のための設定
DETECTION_COUNT_THRESHOLD = 3  # 3回連続で閾値を超えたら「近い」と確定
SCAN_INTERVAL = 2.0  # スキャン間隔（秒）

# OBS WebSocket設定
OBS_HOST = "localhost"  # OBSが動作しているPC（同じPCならlocalhost）
OBS_PORT = 4455  # OBS WebSocketのポート（デフォルト: 4455）
OBS_PASSWORD = ""  # OBS WebSocketのパスワード（設定している場合）

# OBSのシーン名（配信開始時に切り替えるシーンがあれば設定）
OBS_SCENE_NAME = ""  # 空文字列の場合は現在のシーンのまま

# ===== Webhook通知設定（iOSショートカット連携用） =====
# Pushcut Webhook URL（Pushcutアプリで取得したURLを設定）
# 例: "https://api.pushcut.io/あなたのキー/notifications/豚が接近"
# 空文字列の場合はWebhook通知を送信しません
WEBHOOK_URL = ""

# Webhook通知のクールダウン（秒）
# 連続で通知が飛ぶのを防ぐため、一度通知した後この秒数は再通知しません
WEBHOOK_COOLDOWN = 60

# ===== iBeacon 定数 =====
APPLE_COMPANY_ID = 0x004C  # Apple の Company ID
IBEACON_TYPE = b'\x02\x15'  # iBeacon の Type と Length

# ===== グローバル変数 =====
detection_count = 0  # 連続検知カウント
is_streaming = False  # 配信中フラグ
obs_client = None  # OBS WebSocketクライアント
last_webhook_time = 0  # 最後にWebhook通知を送った時刻


def parse_ibeacon_data(manufacturer_data):
    """
    BLEアドバタイズのManufacturer Specific DataからiBeacon情報を解析

    iBeacon フォーマット:
    - Company ID: 0x004C (Apple)
    - Type: 0x02
    - Length: 0x15 (21 bytes)
    - UUID: 16 bytes
    - Major: 2 bytes (big endian)
    - Minor: 2 bytes (big endian)
    - TX Power: 1 byte (signed)

    Returns:
        tuple: (uuid, major, minor, tx_power) or None if not iBeacon
    """
    if APPLE_COMPANY_ID not in manufacturer_data:
        return None

    data = manufacturer_data[APPLE_COMPANY_ID]

    # iBeacon Type (0x02) と Length (0x15) のチェック
    if len(data) < 23 or data[0:2] != IBEACON_TYPE:
        return None

    # UUID を解析 (16 bytes, offset 2-17)
    uuid_bytes = data[2:18]
    uuid_str = '{:08X}-{:04X}-{:04X}-{:04X}-{:012X}'.format(
        struct.unpack('>I', uuid_bytes[0:4])[0],
        struct.unpack('>H', uuid_bytes[4:6])[0],
        struct.unpack('>H', uuid_bytes[6:8])[0],
        struct.unpack('>H', uuid_bytes[8:10])[0],
        struct.unpack('>Q', b'\x00\x00' + uuid_bytes[10:16])[0]
    )

    # Major と Minor を解析 (各2 bytes, big endian)
    major = struct.unpack('>H', data[18:20])[0]
    minor = struct.unpack('>H', data[20:22])[0]

    # TX Power を解析 (1 byte, signed)
    tx_power = struct.unpack('b', data[22:23])[0]

    return uuid_str, major, minor, tx_power


def send_webhook_notification(rssi=None):
    """Webhook通知を送信（Pushcut等のiOSショートカット連携用）"""
    global last_webhook_time

    if not WEBHOOK_URL:
        return

    # クールダウンチェック
    now = time.time()
    if now - last_webhook_time < WEBHOOK_COOLDOWN:
        remaining = int(WEBHOOK_COOLDOWN - (now - last_webhook_time))
        logger.info(f"   📱 Webhook通知スキップ（クールダウン中: あと{remaining}秒）")
        return

    try:
        # 通知データを作成
        payload = json.dumps({
            "title": "🐷 豚が餌場に接近！",
            "text": f"RSSI: {rssi} dBm | {datetime.now().strftime('%H:%M:%S')}",
            "input": json.dumps({
                "rssi": rssi,
                "uuid": IBEACON_UUID,
                "major": IBEACON_MAJOR,
                "minor": IBEACON_MINOR,
                "timestamp": datetime.now().isoformat(),
            }),
        }).encode('utf-8')

        req = urllib.request.Request(
            WEBHOOK_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                last_webhook_time = now
                logger.info("   📱 Webhook通知を送信しました（→ iPhone）")
            else:
                logger.warning(f"   📱 Webhook応答: {resp.status}")

    except urllib.error.URLError as e:
        logger.error(f"   📱 Webhook通知エラー: {e}")
    except Exception as e:
        logger.error(f"   📱 Webhook通知エラー: {e}")


def connect_obs():
    """OBS WebSocketに接続"""
    global obs_client
    try:
        obs_client = obsws(OBS_HOST, OBS_PORT, OBS_PASSWORD)
        obs_client.connect()
        logger.info(f"OBSに接続しました ({OBS_HOST}:{OBS_PORT})")
        return True
    except Exception as e:
        logger.error(f"OBS接続エラー: {e}")
        logger.warning("OBS連携機能は無効です（検知のみ実行されます）")
        obs_client = None
        return False


def start_obs_streaming():
    """OBS配信を開始"""
    global is_streaming

    if obs_client is None:
        logger.warning("OBSに接続されていません")
        return

    try:
        # 配信状態を確認
        status = obs_client.call(obs_requests.GetStreamStatus())

        if status.getOutputActive():
            logger.info("既に配信中です")
            is_streaming = True
            return

        # シーンを切り替え（設定されている場合）
        if OBS_SCENE_NAME:
            obs_client.call(obs_requests.SetCurrentProgramScene(sceneName=OBS_SCENE_NAME))
            logger.info(f"シーンを'{OBS_SCENE_NAME}'に切り替えました")

        # 配信開始
        obs_client.call(obs_requests.StartStream())
        is_streaming = True
        logger.info("✅ OBS配信を開始しました！")

    except Exception as e:
        logger.error(f"OBS配信開始エラー: {e}")


def stop_obs_streaming():
    """OBS配信を停止"""
    global is_streaming

    if obs_client is None:
        logger.warning("OBSに接続されていません")
        return

    try:
        # 配信状態を確認
        status = obs_client.call(obs_requests.GetStreamStatus())

        if not status.getOutputActive():
            logger.info("配信は既に停止しています")
            is_streaming = False
            return

        # 配信停止
        obs_client.call(obs_requests.StopStream())
        is_streaming = False
        logger.info("⏹️  OBS配信を停止しました")

    except Exception as e:
        logger.error(f"OBS配信停止エラー: {e}")


async def scan_ble_devices():
    """BLEデバイスをスキャンしてiBeaconのRSSI値を取得"""
    try:
        devices = await BleakScanner.discover(timeout=SCAN_INTERVAL, return_adv=True)

        target_uuid = IBEACON_UUID.upper()

        for device, adv_data in devices.values():
            # Manufacturer Specific Data から iBeacon 情報を解析
            if not adv_data.manufacturer_data:
                continue

            ibeacon = parse_ibeacon_data(adv_data.manufacturer_data)
            if ibeacon is None:
                continue

            uuid, major, minor, tx_power = ibeacon

            # UUID / Major / Minor が一致するか確認
            if uuid.upper() == target_uuid and major == IBEACON_MAJOR and minor == IBEACON_MINOR:
                rssi = adv_data.rssi
                return device, rssi, uuid, major, minor

        return None, None, None, None, None

    except Exception as e:
        logger.error(f"BLEスキャンエラー: {e}")
        return None, None, None, None, None


async def monitor_loop():
    """メインの監視ループ"""
    global detection_count, is_streaming

    logger.info("=" * 60)
    logger.info("🐷 豚の接近検知システム 起動")
    logger.info("   ビーコン: サンワサプライ 400-MMBLEBC9P3")
    logger.info("=" * 60)
    logger.info(f"対象ビーコン UUID: {IBEACON_UUID}")
    logger.info(f"対象ビーコン Major: {IBEACON_MAJOR}, Minor: {IBEACON_MINOR}")
    logger.info(f"RSSI閾値: {RSSI_THRESHOLD} dBm")
    logger.info(f"検知確定回数: {DETECTION_COUNT_THRESHOLD}回")
    logger.info("=" * 60)

    # OBSに接続
    connect_obs()

    logger.info("\n監視を開始します...\n")

    try:
        while True:
            # BLEデバイスをスキャン
            device, rssi, uuid, major, minor = await scan_ble_devices()

            if device and rssi:
                # ビーコンが見つかった
                distance_indicator = "📍" if rssi > RSSI_THRESHOLD else "📌"
                logger.info(f"{distance_indicator} iBeacon検出 [Major:{major} Minor:{minor}] - RSSI: {rssi} dBm")

                if rssi > RSSI_THRESHOLD:
                    # 閾値を超えている = 近い
                    detection_count += 1
                    logger.info(f"   ⚠️  閾値超過 ({detection_count}/{DETECTION_COUNT_THRESHOLD})")

                    if detection_count >= DETECTION_COUNT_THRESHOLD and not is_streaming:
                        # 検知確定！配信開始
                        logger.info("\n" + "=" * 60)
                        logger.info("🎉 豚が餌場に接近しました！")
                        logger.info("=" * 60 + "\n")
                        start_obs_streaming()
                        send_webhook_notification(rssi)
                else:
                    # 閾値以下 = 遠い
                    if detection_count > 0:
                        logger.info(f"   ℹ️  カウントリセット")
                    detection_count = 0

                    # 配信中で豚が離れた場合は配信を停止（オプション）
                    # 注意: 自動停止を有効にする場合は以下のコメントを外してください
                    # if is_streaming:
                    #     logger.info("\n豚が離れました。配信を停止します。\n")
                    #     stop_obs_streaming()
            else:
                # ビーコンが見つからない
                if detection_count > 0:
                    logger.info(f"⚠️  ビーコンが見つかりません（カウントリセット）")
                detection_count = 0

                # 配信中でビーコンが見つからない場合の処理（オプション）
                # if is_streaming:
                #     logger.info("\nビーコンが見つかりません。配信を停止します。\n")
                #     stop_obs_streaming()

            # 次のスキャンまで待機
            await asyncio.sleep(SCAN_INTERVAL)

    except KeyboardInterrupt:
        logger.info("\n\n監視を終了します...")
        if obs_client:
            obs_client.disconnect()
        logger.info("プログラムを終了しました")


def main():
    """メイン関数"""
    try:
        asyncio.run(monitor_loop())
    except Exception as e:
        logger.error(f"予期しないエラー: {e}")
        if obs_client:
            obs_client.disconnect()


if __name__ == "__main__":
    main()
