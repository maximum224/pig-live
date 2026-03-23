/**
 * 🐷 豚ライブ配信システム - スマホ用Webアプリ
 *
 * BLE iBeacon検出 + ふわっち自動配信（Larix Broadcaster連携）
 * 対応ビーコン: サンワサプライ 400-MMBLEBC9P3
 */

// ===== 定数 =====
const APPLE_COMPANY_ID = 0x004c;
const IBEACON_TYPE_HI = 0x02;
const IBEACON_TYPE_LO = 0x15;
const STORAGE_KEY = 'pig-live-settings';

// ===== 状態管理 =====
const state = {
    // 設定
    settings: {
        uuid: '7777772E-6B6B-6D63-6E2E-636F6D000001',
        major: 1,
        minor: 1,
        rssiThreshold: -60,
        detectionCountThreshold: 3,
        scanInterval: 3,
        streamKey: '',
        rtmpUrl: 'rtmp://rtmp.whowatch.tv/live',
    },
    // 監視状態
    monitoring: false,
    scanning: false,
    scanTimer: null,
    // 検知状態
    detectionCount: 0,
    lastRssi: null,
    rssiHistory: [],
    // 配信
    isStreaming: false,
    autoStream: true,
    // BLE
    bleSupported: false,
    bleDevice: null,
    bleScan: null,
    // プラットフォーム
    platform: 'android', // 'android' or 'ios'
};

// ===== DOM要素 =====
const dom = {};

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
    cacheDom();
    loadSettings();
    checkBleSupport();
    detectPlatform();
    bindEvents();
    updateUI();
    log('アプリを起動しました', 'info');
});

function cacheDom() {
    const ids = [
        'headerStatus', 'statusCard', 'statusIcon', 'statusTitle', 'statusMessage',
        'btnToggleMonitor', 'rssiCard', 'rssiValue', 'rssiBar', 'rssiThresholdLine',
        'thresholdDisplay', 'rssiHistory', 'streamCard', 'streamBadge',
        'streamStatus', 'btnStartStream', 'chkAutoStream',
        'settingsBody', 'btnToggleSettings', 'btnSaveSettings',
        'inputUuid', 'inputMajor', 'inputMinor', 'inputThreshold',
        'thresholdRangeValue', 'inputDetectionCount', 'inputScanInterval',
        'inputStreamKey', 'inputRtmpUrl', 'btnCopyLarixSettings',
        'logContainer', 'btnClearLog', 'notification',
        'notifIcon', 'notifText',
        'btnAndroid', 'btnIos', 'pushcutCard', 'pushcutBadge',
        'inputWebhookTest', 'btnTestWebhook',
    ];
    ids.forEach(id => { dom[id] = document.getElementById(id); });
}

function checkBleSupport() {
    state.bleSupported = !!navigator.bluetooth;
}

function detectPlatform() {
    // 保存されている設定を優先
    const saved = localStorage.getItem('pig-live-platform');
    if (saved === 'android' || saved === 'ios') {
        switchPlatform(saved);
        return;
    }
    // UAから自動判定
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod|mac/.test(ua) && !/android/.test(ua)) {
        switchPlatform('ios');
    } else {
        switchPlatform('android');
    }
}

function switchPlatform(platform) {
    state.platform = platform;
    localStorage.setItem('pig-live-platform', platform);

    // ボタンの状態更新
    dom.btnAndroid.classList.toggle('active', platform === 'android');
    dom.btnIos.classList.toggle('active', platform === 'ios');

    // bodyクラスで表示切替
    document.body.classList.remove('mode-android', 'mode-ios');
    document.body.classList.add(`mode-${platform}`);

    if (platform === 'ios') {
        // iOSモード: Bluefy検出チェック（初期化順序に依存しないよう直接チェック）
        if (!!navigator.bluetooth) {
            // Bluefy等のBLE対応ブラウザを使用中 → BLEスキャン有効
            document.body.classList.remove('mode-ios');
            document.body.classList.add('mode-android'); // BLE系UIを表示
            if (dom.pushcutCard) dom.pushcutCard.style.display = 'none';
            if (!state.monitoring) {
                dom.statusTitle.textContent = 'iPhone（Bluefy）';
                dom.statusMessage.textContent = '「監視開始」でBLEスキャンを開始できます';
            }
            log('プラットフォーム: iPhone モード（Bluefy BLE対応 ✅）', 'success');
        } else {
            // Safari等 → Pushcutフォールバック + Bluefy案内
            if (dom.pushcutCard) dom.pushcutCard.style.display = '';
            if (!state.monitoring) {
                dom.statusTitle.textContent = 'iPhoneモード';
                dom.statusMessage.textContent = 'Bluefyブラウザで開くとBLEスキャンが使えます';
            }
            log('プラットフォーム: iPhone モード（Safari - BLE非対応）', 'warning');
            log('💡 App Storeで「Bluefy」をインストールすると、iPhoneだけでBLE検知できます', 'info');
        }
    } else {
        // Androidモード
        if (dom.pushcutCard) dom.pushcutCard.style.display = 'none';
        if (!state.monitoring) {
            dom.statusTitle.textContent = '監視停止中';
            dom.statusMessage.textContent = '「監視開始」ボタンを押してスキャンを開始してください';
            if (!state.bleSupported) {
                dom.statusMessage.textContent = '❗ このブラウザはWeb Bluetooth非対応です。Android Chromeをご利用ください。';
            }
        }
        log('プラットフォーム: Android モード', 'info');
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(state.settings, parsed);
        }
    } catch (e) { /* ignore */ }
    applySettingsToForm();
}

function saveSettings() {
    gatherSettingsFromForm();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch (e) { /* ignore */ }
    applySettingsToForm();
    notify('設定を保存しました', 'success');
    log('設定を保存しました', 'success');
}

function gatherSettingsFromForm() {
    state.settings.uuid = dom.inputUuid.value.trim();
    state.settings.major = parseInt(dom.inputMajor.value, 10) || 0;
    state.settings.minor = parseInt(dom.inputMinor.value, 10) || 0;
    state.settings.rssiThreshold = parseInt(dom.inputThreshold.value, 10);
    state.settings.detectionCountThreshold = parseInt(dom.inputDetectionCount.value, 10) || 3;
    state.settings.scanInterval = parseInt(dom.inputScanInterval.value, 10) || 3;
    state.settings.streamKey = dom.inputStreamKey.value.trim();
    state.settings.rtmpUrl = dom.inputRtmpUrl.value.trim();
    updateStreamBadge();
}

function applySettingsToForm() {
    dom.inputUuid.value = state.settings.uuid;
    dom.inputMajor.value = state.settings.major;
    dom.inputMinor.value = state.settings.minor;
    dom.inputThreshold.value = state.settings.rssiThreshold;
    dom.thresholdRangeValue.textContent = `${state.settings.rssiThreshold} dBm`;
    dom.thresholdDisplay.textContent = state.settings.rssiThreshold;
    dom.inputDetectionCount.value = state.settings.detectionCountThreshold;
    dom.inputScanInterval.value = state.settings.scanInterval;
    dom.inputStreamKey.value = state.settings.streamKey;
    dom.inputRtmpUrl.value = state.settings.rtmpUrl;
    updateThresholdLine();
    updateStreamBadge();
}

function bindEvents() {
    dom.btnToggleMonitor.addEventListener('click', toggleMonitor);
    dom.btnToggleSettings.addEventListener('click', toggleSettings);
    dom.btnSaveSettings.addEventListener('click', saveSettings);
    dom.btnClearLog.addEventListener('click', clearLog);
    dom.btnStartStream.addEventListener('click', openLarix);
    dom.chkAutoStream.addEventListener('change', (e) => {
        state.autoStream = e.target.checked;
    });
    dom.inputThreshold.addEventListener('input', (e) => {
        dom.thresholdRangeValue.textContent = `${e.target.value} dBm`;
    });
    dom.btnCopyLarixSettings.addEventListener('click', copyLarixSettings);

    // プラットフォーム切替
    dom.btnAndroid.addEventListener('click', () => switchPlatform('android'));
    dom.btnIos.addEventListener('click', () => switchPlatform('ios'));

    // Webhookテスト
    dom.btnTestWebhook.addEventListener('click', testWebhook);
}

async function testWebhook() {
    const url = dom.inputWebhookTest.value.trim();
    if (!url) {
        notify('Webhook URLを入力してください', 'error');
        return;
    }

    try {
        log('🔔 テスト通知を送信中...', 'info');
        const payload = JSON.stringify({
            title: '🐷 テスト通知',
            text: `テスト送信: ${new Date().toLocaleTimeString('ja-JP')}`,
        });

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
        });

        if (res.ok) {
            log('✅ テスト通知を送信しました！', 'success');
            notify('テスト通知を送信しました', 'success');
            dom.pushcutBadge.textContent = '設定済み';
            dom.pushcutBadge.className = 'pushcut-badge ready';
        } else {
            log(`❌ 通知送信失敗: HTTP ${res.status}`, 'error');
            notify('通知送信に失敗しました', 'error');
        }
    } catch (err) {
        log(`❌ Webhookエラー: ${err.message}`, 'error');
        notify(`Webhookエラー: ${err.message}`, 'error');
    }
}

// ===== BLE スキャン =====

async function toggleMonitor() {
    if (state.monitoring) {
        stopMonitoring();
    } else {
        await startMonitoring();
    }
}

async function startMonitoring() {
    if (!state.bleSupported) {
        notify('Web Bluetooth に対応していません', 'error');
        return;
    }

    gatherSettingsFromForm();

    try {
        log('BLEスキャン権限をリクエスト中...', 'info');

        // Web Bluetooth API requestLEScan を試行
        // フォールバック: requestDevice で手動接続
        if (navigator.bluetooth.requestLEScan) {
            await startBLEScan();
        } else {
            // requestLEScan 非対応の場合は定期スキャンで代替
            await startPeriodicScan();
        }

        state.monitoring = true;
        state.detectionCount = 0;
        updateUI();
        log(`監視開始 - UUID: ${state.settings.uuid}, Major: ${state.settings.major}, Minor: ${state.settings.minor}`, 'success');
    } catch (err) {
        log(`BLEスキャン開始エラー: ${err.message}`, 'error');
        notify('BLEスキャンを開始できませんでした', 'error');
    }
}

async function startBLEScan() {
    try {
        log('（許可画面が出ない場合はURLバー左の🔒マークから権限を確認してください）', 'info');
        
        // 10秒でタイムアウトさせる（Chromeが黙ってハングするバグへの対策）
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('許可ダイアログが開かずにタイムアウトしました')), 10000)
        );
        
        const scanOptions = { acceptAllAdvertisements: true };
        const scanPromise = navigator.bluetooth.requestLEScan(scanOptions);
        
        state.bleScan = await Promise.race([scanPromise, timeoutPromise]);

        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);

        log(`BLE広告スキャンを開始しました（active:${state.bleScan?.active}）`, 'success');
    } catch (err) {
        log(`スキャン開始エラー: ${err.message}`, 'error');
        if (err.message.includes('タイムアウト')) {
            log('💡 ヒント: Android Chromeの設定で「Experimental Web Platform features」がEnabledになっているか、スマホ本体の位置情報がONになっているか再確認してください。', 'warning');
        } else {
            // その他のエラーの場合は定期スキャン（requestDevice）を試す
            await startPeriodicScan();
        }
    }
}

async function startPeriodicScan() {
    log('デバイスリストからビーコンを選択してください...', 'info');

    const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
    });

    state.bleDevice = device;
    log(`ビーコン選択: ${device.name || '(名前なし)'}`, 'success');

    if (!device.watchAdvertisements) {
        log('このブラウザはwatchAdvertisementsに対応していません', 'error');
        throw new Error('watchAdvertisements非対応');
    }

    device.addEventListener('advertisementreceived', handleAdvertisement);
    await device.watchAdvertisements();
    log('広告監視を開始しました（watchAdvertisementsモード）', 'success');
}

function scheduleScan() {
    if (!state.monitoring) return;

    state.scanTimer = setTimeout(async () => {
        if (!state.monitoring) return;
        await performSingleScan();
        scheduleScan();
    }, state.settings.scanInterval * 1000);
}

async function performSingleScan() {
    if (state.scanning) return;
    state.scanning = true;

    try {
        // Web Bluetooth API の制限: requestDevice はユーザージェスチャーが必要
        // ここでは advertisementreceived イベントが使えない場合の
        // フォールバックとして、最後に接続したデバイスからRSSIを取得
        if (state.bleDevice && state.bleDevice.gatt) {
            try {
                if (!state.bleDevice.gatt.connected) {
                    await state.bleDevice.gatt.connect();
                }
                // RSSI は直接取れないため、接続状態で検知扱い
                handleDetection(-50); // 接続できれば近い
            } catch (e) {
                handleNoDetection();
            }
        } else {
            handleNoDetection();
        }
    } catch (err) {
        log(`スキャンエラー: ${err.message}`, 'error');
    } finally {
        state.scanning = false;
    }
}

function handleAdvertisement(event) {
    const rssi = event.rssi;
    log(`📻 広告受信: ${event.device.name || '名前なし'} RSSI:${rssi}`, 'info');

    // watchAdvertisementsモード: ユーザーが選択済みのデバイスなのでRSSIをそのまま使用
    if (state.bleDevice) {
        handleDetection(rssi);
        return;
    }

    // requestLEScanモード: iBeaconフォーマットを解析してUUID/Major/Minorを確認
    const manufacturerData = event.manufacturerData;
    if (!manufacturerData) return;

    const ibeacon = extractIBeacon(manufacturerData);
    if (!ibeacon) return;

    const { uuid, major, minor } = ibeacon;
    log(`🔵 iBeacon検出: UUID=${uuid} Major=${major} Minor=${minor}`, 'info');

    if (uuid.toUpperCase() !== state.settings.uuid.toUpperCase()) {
        log(`　└ UUID不一致（設定値: ${state.settings.uuid}）`, 'warning');
        return;
    }
    if (major !== state.settings.major || minor !== state.settings.minor) {
        log(`　└ Major/Minor不一致（設定値: ${state.settings.major}/${state.settings.minor}）`, 'warning');
        return;
    }

    handleDetection(rssi);
}

function extractIBeacon(manufacturerData) {
    try {
        // 標準 Web Bluetooth: BluetoothManufacturerDataMap (Map形式)
        if (typeof manufacturerData.get === 'function') {
            const appleData = manufacturerData.get(APPLE_COMPANY_ID);
            if (!appleData) return null;
            const bytes = new Uint8Array(appleData.buffer, appleData.byteOffset, appleData.byteLength);
            return parseIBeaconBytes(bytes, 0);
        }
        // Bluefy: DataView (生バイト列、Company IDプレフィックスを含む場合あり)
        if (manufacturerData.byteLength !== undefined) {
            const bytes = new Uint8Array(manufacturerData.buffer, manufacturerData.byteOffset, manufacturerData.byteLength);
            // 先頭16バイトをHEXでログ出力
            const hex = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2,'0')).join(' ');
            log(`　└ 生バイト(${bytes.length}B): ${hex}`, 'info');
            // Apple Company ID (0x4C 0x00) が先頭にあればスキップ
            const offset = (bytes.length >= 2 && bytes[0] === 0x4C && bytes[1] === 0x00) ? 2 : 0;
            return parseIBeaconBytes(bytes, offset);
        }
    } catch (e) {
        log(`iBeacon解析エラー: ${e.message}`, 'error');
    }
    return null;
}

function parseIBeaconBytes(bytes, offset) {
    if (bytes.length < offset + 21) return null;
    if (bytes[offset] !== IBEACON_TYPE_HI || bytes[offset + 1] !== IBEACON_TYPE_LO) return null;
    offset += 2;
    const uuidBytes = bytes.slice(offset, offset + 16);
    const uuid = formatUUID(uuidBytes);
    offset += 16;
    const major = (bytes[offset] << 8) | bytes[offset + 1];
    const minor = (bytes[offset + 2] << 8) | bytes[offset + 3];
    return { uuid, major, minor };
}

function formatUUID(bytes) {
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`.toUpperCase();
}

function handleDetection(rssi) {
    state.lastRssi = rssi;
    addRssiHistory(rssi);
    updateRssiDisplay(rssi);

    if (rssi > state.settings.rssiThreshold) {
        state.detectionCount++;
        log(`📍 iBeacon検出 [Major:${state.settings.major} Minor:${state.settings.minor}] RSSI: ${rssi} dBm ⚠️ (${state.detectionCount}/${state.settings.detectionCountThreshold})`, 'warning');

        if (state.detectionCount >= state.settings.detectionCountThreshold) {
            onPigDetected();
        }
    } else {
        if (state.detectionCount > 0) {
            log(`📌 iBeacon検出 RSSI: ${rssi} dBm - カウントリセット`, 'info');
        }
        state.detectionCount = 0;
        updateStatusUI('monitoring');
    }
}

function handleNoDetection() {
    if (state.detectionCount > 0) {
        log('ビーコン未検出 - カウントリセット', 'info');
    }
    state.detectionCount = 0;
    updateStatusUI('monitoring');
}

function onPigDetected() {
    log('🎉 豚が餌場に接近しました！', 'success');
    notify('🐷 豚が餌場に接近しました！', 'success');
    updateStatusUI('detected');

    if (state.autoStream && !state.isStreaming) {
        openLarix();
    }
}

function stopMonitoring() {
    state.monitoring = false;
    state.detectionCount = 0;

    if (state.scanTimer) {
        clearTimeout(state.scanTimer);
        state.scanTimer = null;
    }

    // BLE scan stop
    try {
        if (state.bleScan) {
            state.bleScan.stop();
            state.bleScan = null;
        }
        if (state.bleDevice) {
            try { state.bleDevice.unwatchAdvertisements?.(); } catch (e) {}
            state.bleDevice.removeEventListener('advertisementreceived', handleAdvertisement);
            state.bleDevice = null;
        }
        navigator.bluetooth?.removeEventListener?.('advertisementreceived', handleAdvertisement);
    } catch (e) { /* ignore */ }

    updateUI();
    log('監視を停止しました', 'info');
}

// ===== RSSI表示 =====

function updateRssiDisplay(rssi) {
    dom.rssiCard.style.display = '';
    dom.rssiValue.textContent = `${rssi} dBm`;

    // -100 ~ -30 を 0% ~ 100% にマッピング
    const pct = Math.max(0, Math.min(100, ((rssi + 100) / 70) * 100));
    dom.rssiBar.style.width = `${pct}%`;

    // 色の更新
    if (rssi > state.settings.rssiThreshold) {
        dom.rssiValue.style.color = 'var(--success)';
    } else {
        dom.rssiValue.style.color = 'var(--info)';
    }
}

function updateThresholdLine() {
    const pct = Math.max(0, Math.min(100, ((state.settings.rssiThreshold + 100) / 70) * 100));
    dom.rssiThresholdLine.style.left = `${pct}%`;
}

function addRssiHistory(rssi) {
    state.rssiHistory.push(rssi);
    if (state.rssiHistory.length > 30) state.rssiHistory.shift();
    renderRssiHistory();
}

function renderRssiHistory() {
    dom.rssiHistory.innerHTML = '';
    state.rssiHistory.forEach(rssi => {
        const bar = document.createElement('div');
        bar.className = 'rssi-history-bar';
        const h = Math.max(4, ((rssi + 100) / 70) * 36);
        bar.style.height = `${h}px`;

        if (rssi > state.settings.rssiThreshold) {
            bar.style.background = 'var(--success)';
        } else {
            bar.style.background = 'var(--info)';
        }
        dom.rssiHistory.appendChild(bar);
    });
}

// ===== ふわっち配信（Larix Broadcaster連携） =====

function openLarix() {
    if (!state.settings.streamKey) {
        notify('設定からストリームキーを入力してください', 'error');
        toggleSettings(true);
        return;
    }
    log('Larix Broadcasterを起動します...', 'info');
    log('※ Larixで「自動接続」が有効になっていれば配信が自動開始されます', 'info');
    state.isStreaming = true;
    updateStreamBadge();
    // Larixを起動（インストール済みの場合はアプリが開く）
    window.location.href = 'larix://';
}

function copyLarixSettings() {
    gatherSettingsFromForm();
    const { rtmpUrl, streamKey } = state.settings;
    if (!streamKey) {
        notify('先にストリームキーを入力してください', 'error');
        return;
    }
    const text = `RTMP URL: ${rtmpUrl}\nストリームキー: ${streamKey}`;
    navigator.clipboard.writeText(text).then(() => {
        notify('Larix設定をコピーしました', 'success');
        log('Larix設定をクリップボードにコピーしました', 'success');
    }).catch(() => {
        prompt('Larixに入力してください:', text);
    });
}

function updateStreamBadge() {
    if (!dom.streamBadge) return;
    const hasKey = !!state.settings.streamKey;
    dom.streamBadge.textContent = hasKey ? '設定済み' : '未設定';
    dom.streamBadge.className = hasKey ? 'stream-badge connected' : 'stream-badge';
    if (dom.streamStatus) {
        dom.streamStatus.textContent = state.isStreaming ? '起動中...' : '停止中';
    }
}

// ===== UI更新 =====

function updateUI() {
    updateStatusUI(state.monitoring ? 'monitoring' : 'idle');
    updateMonitorButton();
    updateStreamBadge();
    updateThresholdLine();
}

function updateStatusUI(status) {
    const headerDot = dom.headerStatus.querySelector('.status-dot');
    const headerText = dom.headerStatus.querySelector('.status-text');

    switch (status) {
        case 'idle':
            dom.statusIcon.innerHTML = '<span>📡</span>';
            dom.statusIcon.className = 'status-icon';
            if (state.platform === 'ios') {
                dom.statusTitle.textContent = 'iPhoneモード';
                dom.statusMessage.textContent = 'PCの ble_monitor.py から Pushcut 経由で通知を受取ります';
            } else {
                dom.statusTitle.textContent = '監視停止中';
                dom.statusMessage.textContent = '「監視開始」ボタンを押してスキャンを開始してください';
            }
            dom.statusCard.classList.remove('active');
            headerDot.className = 'status-dot offline';
            headerText.textContent = '停止中';
            break;
        case 'monitoring':
            dom.statusIcon.innerHTML = '<span>🔍</span>';
            dom.statusIcon.className = 'status-icon scanning';
            dom.statusTitle.textContent = '監視中...';
            dom.statusMessage.textContent = 'ビーコンを探しています';
            dom.statusCard.classList.add('active');
            headerDot.className = 'status-dot monitoring';
            headerText.textContent = '監視中';
            break;
        case 'detected':
            dom.statusIcon.innerHTML = '<span>🐷</span>';
            dom.statusIcon.className = 'status-icon detected';
            dom.statusTitle.textContent = '🎉 豚が接近！';
            dom.statusMessage.textContent = '餌場付近で検知しました';
            dom.statusCard.classList.add('active');
            headerDot.className = 'status-dot detected';
            headerText.textContent = '検知！';
            break;
    }
}

function updateMonitorButton() {
    if (state.monitoring) {
        dom.btnToggleMonitor.innerHTML = '<span class="btn-icon">⏹</span> 監視停止';
        dom.btnToggleMonitor.classList.add('running');
    } else {
        dom.btnToggleMonitor.innerHTML = '<span class="btn-icon">▶</span> 監視開始';
        dom.btnToggleMonitor.classList.remove('running');
    }
}

function toggleSettings(forceOpen) {
    const body = dom.settingsBody;
    const isOpen = body.classList.contains('open');

    if (forceOpen === true || !isOpen) {
        body.classList.add('open');
        dom.btnToggleSettings.querySelector('span').textContent = '▲';
    } else {
        body.classList.remove('open');
        dom.btnToggleSettings.querySelector('span').textContent = '▼';
    }
}

// ===== ログ =====

function log(message, type = 'info') {
    const container = dom.logContainer;
    const emptyMsg = container.querySelector('.log-empty');
    if (emptyMsg) emptyMsg.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;

    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;

    // 最大100件
    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}

function clearLog() {
    dom.logContainer.innerHTML = '<div class="log-empty">ログはまだありません</div>';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== 通知 =====

let notifTimeout;

function notify(text, type = 'info') {
    const el = dom.notification;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    dom.notifIcon.textContent = icons[type] || icons.info;
    dom.notifText.textContent = text;
    el.className = `notification ${type} show`;

    clearTimeout(notifTimeout);
    notifTimeout = setTimeout(() => {
        el.classList.remove('show');
    }, 3500);
}
