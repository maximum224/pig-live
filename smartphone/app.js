/**
 * 🐷 豚ライブ配信システム - スマホ用Webアプリ
 *
 * BLE iBeacon検出 + YouTube Live 自動配信
 * 対応ビーコン: サンワサプライ 400-MMBLEBC9P3
 */

// ===== 定数 =====
const APPLE_COMPANY_ID = 0x004c;
const IBEACON_TYPE_HI = 0x02;
const IBEACON_TYPE_LO = 0x15;
const YOUTUBE_API_SCOPE = 'https://www.googleapis.com/auth/youtube';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
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
        googleClientId: '',
    },
    // 監視状態
    monitoring: false,
    scanning: false,
    scanTimer: null,
    // 検知状態
    detectionCount: 0,
    lastRssi: null,
    rssiHistory: [],
    // YouTube
    ytAccessToken: null,
    ytChannelName: null,
    ytBroadcastId: null,
    ytStreamId: null,
    isStreaming: false,
    autoStream: true,
    // BLE
    bleSupported: false,
    bleDevice: null,
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
        'ytAuthSection', 'ytStreamSection', 'btnYtAuth', 'ytChannelName',
        'ytStreamStatus', 'btnStartStream', 'btnStopStream', 'chkAutoStream',
        'settingsBody', 'btnToggleSettings', 'btnSaveSettings',
        'inputUuid', 'inputMajor', 'inputMinor', 'inputThreshold',
        'thresholdRangeValue', 'inputDetectionCount', 'inputScanInterval',
        'inputClientId', 'logContainer', 'btnClearLog', 'notification',
        'notifIcon', 'notifText',
        'btnAndroid', 'btnIos', 'pushcutCard', 'pushcutBadge',
        'inputWebhookTest', 'btnTestWebhook', 'btnCopyBluefyLink',
        'ytTokenSection', 'ytAuthStatus', 'btnReauth',
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
        // iOSモード: Bluefy検出チェック
        if (state.bleSupported) {
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

    // YouTubeトークンの復元
    const savedToken = localStorage.getItem('pig-live-yt-token');
    if (savedToken) {
        state.ytAccessToken = savedToken;
        dom.ytTokenSection.style.display = '';
        dom.ytAuthSection.style.display = 'none';
        fetchYouTubeChannel();
    }
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
    state.settings.googleClientId = dom.inputClientId.value.trim();
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
    dom.inputClientId.value = state.settings.googleClientId;
    updateThresholdLine();
}

function bindEvents() {
    dom.btnToggleMonitor.addEventListener('click', toggleMonitor);
    dom.btnToggleSettings.addEventListener('click', toggleSettings);
    dom.btnSaveSettings.addEventListener('click', saveSettings);
    dom.btnClearLog.addEventListener('click', clearLog);
    dom.btnYtAuth.addEventListener('click', startYouTubeAuth);
    dom.btnReauth.addEventListener('click', startYouTubeAuth);
    dom.btnStartStream.addEventListener('click', startYouTubeStream);
    dom.btnStopStream.addEventListener('click', stopYouTubeStream);
    dom.chkAutoStream.addEventListener('change', (e) => {
        state.autoStream = e.target.checked;
    });
    dom.inputThreshold.addEventListener('input', (e) => {
        dom.thresholdRangeValue.textContent = `${e.target.value} dBm`;
    });

    // プラットフォーム切替
    dom.btnAndroid.addEventListener('click', () => switchPlatform('android'));
    dom.btnIos.addEventListener('click', () => switchPlatform('ios'));

    // Webhookテスト
    dom.btnTestWebhook.addEventListener('click', testWebhook);

    // Bluefy用リンクコピー
    if (dom.btnCopyBluefyLink) {
        dom.btnCopyBluefyLink.addEventListener('click', copyBluefyLink);
    }

    // OAuth コールバック処理
    handleOAuthCallback();
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
        
        const scan = await Promise.race([scanPromise, timeoutPromise]);

        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);

        log('BLE広告スキャンを開始しました（リアルタイムモード）', 'success');
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
    log('定期スキャンモードで監視を開始します', 'info');
    log('※ ブラウザの制限により、スキャンごとにデバイス選択が必要な場合があります', 'warning');

    state.monitoring = true;
    scheduleScan();
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
    const manufacturerData = event.manufacturerData;
    if (!manufacturerData) return;

    // Apple Company ID (0x004C) のデータを探す
    const appleData = manufacturerData.get(APPLE_COMPANY_ID);
    if (!appleData) return;

    const data = new Uint8Array(appleData.buffer);

    // iBeacon フォーマットチェック
    if (data.length < 23 || data[0] !== IBEACON_TYPE_HI || data[1] !== IBEACON_TYPE_LO) return;

    // UUID を解析
    const uuidBytes = data.slice(2, 18);
    const uuid = formatUUID(uuidBytes);

    // Major / Minor を解析
    const major = (data[18] << 8) | data[19];
    const minor = (data[20] << 8) | data[21];

    // ターゲット判定
    if (uuid.toUpperCase() !== state.settings.uuid.toUpperCase()) return;
    if (major !== state.settings.major || minor !== state.settings.minor) return;

    // RSSI
    const rssi = event.rssi;
    handleDetection(rssi);
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

    // 自動配信
    if (state.autoStream && state.ytAccessToken && !state.isStreaming) {
        log('自動配信を開始します...', 'info');
        startYouTubeStream();
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

// ===== YouTube Live API =====

function startYouTubeAuth() {
    gatherSettingsFromForm();
    const clientId = state.settings.googleClientId;

    if (!clientId) {
        notify('Google OAuth Client ID を設定してください', 'error');
        toggleSettings(true);
        return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(YOUTUBE_API_SCOPE)}` +
        `&prompt=consent`;

    window.location.href = authUrl;
}

function handleOAuthCallback() {
    // 1. URLパラメータからのインポート (?import_token=XXX)
    const searchParams = new URLSearchParams(window.location.search);
    const importToken = searchParams.get('import_token');
    if (importToken) {
        saveYtToken(importToken);
        // URLをクリーンアップ
        window.history.replaceState({}, document.title, window.location.pathname);
        log('設定リンクからYouTube認証をインポートしました', 'success');
        fetchYouTubeChannel();
        return;
    }

    // 2. 通常のOAuthハッシュからの取得 (#access_token=XXX)
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');

    if (accessToken) {
        saveYtToken(accessToken);
        window.location.hash = '';
        log('YouTube認証に成功しました', 'success');
        fetchYouTubeChannel();
    }
}

function saveYtToken(token) {
    state.ytAccessToken = token;
    if (token) {
        localStorage.setItem('pig-live-yt-token', token);
        dom.ytTokenSection.style.display = '';
        dom.ytAuthSection.style.display = 'none';
    } else {
        localStorage.removeItem('pig-live-yt-token');
        dom.ytTokenSection.style.display = 'none';
        dom.ytAuthSection.style.display = '';
    }
}

function copyBluefyLink() {
    if (!state.ytAccessToken) return;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('import_token', state.ytAccessToken);
    
    // クリップボードにコピー
    navigator.clipboard.writeText(url.toString()).then(() => {
        notify('コピーしました！Bluefyで開いてください', 'success');
        log('Bluefy用リンクをクリップボードにコピーしました', 'success');
    }).catch(err => {
        log(`リンクコピーに失敗: ${err.message}`, 'error');
        // fallback
        prompt('以下のURLをコピーしてBluefyで開いてください:', url.toString());
    });
}

async function fetchYouTubeChannel() {
    dom.ytAuthStatus.textContent = 'チャンネル情報を取得中...';
    try {
        const res = await fetch(`${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`, {
            headers: { 'Authorization': `Bearer ${state.ytAccessToken}` }
        });
        const data = await res.json();

        if (data.error) {
            const isExpired = data.error.code === 401;
            const msg = isExpired
                ? 'トークン期限切れ - 「再認証」ボタンを押してください'
                : `APIエラー: ${data.error.message}`;
            dom.ytAuthStatus.textContent = msg;
            log(`YouTube API エラー: ${data.error.message}`, 'error');
            return;
        }

        if (data.items && data.items.length > 0) {
            state.ytChannelName = data.items[0].snippet.title;
            dom.ytChannelName.textContent = state.ytChannelName;
            dom.ytAuthStatus.textContent = `✅ ${state.ytChannelName}`;
            dom.ytStreamSection.style.display = '';
            dom.streamBadge.textContent = '接続済み';
            dom.streamBadge.className = 'stream-badge connected';
            dom.btnStartStream.disabled = false;
            log(`YouTube チャンネル: ${state.ytChannelName}`, 'success');
        } else {
            dom.ytAuthStatus.textContent = 'YouTubeチャンネルが見つかりません';
            log('YouTubeチャンネルが見つかりません', 'warning');
        }
    } catch (err) {
        dom.ytAuthStatus.textContent = `接続エラー: ${err.message}`;
        log(`YouTube API エラー: ${err.message}`, 'error');
    }
}

async function startYouTubeStream() {
    if (!state.ytAccessToken) {
        notify('YouTubeに接続してください', 'error');
        return;
    }

    try {
        log('YouTube Live 配信を作成中...', 'info');

        // 1. Broadcast を作成
        const now = new Date().toISOString();
        const broadcastRes = await fetch(`${YOUTUBE_API_BASE}/liveBroadcasts?part=snippet,status,contentDetails`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.ytAccessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                snippet: {
                    title: `🐷 豚ライブ配信 - ${new Date().toLocaleString('ja-JP')}`,
                    scheduledStartTime: now,
                },
                status: {
                    privacyStatus: 'public',
                    selfDeclaredMadeForKids: false,
                },
                contentDetails: {
                    enableAutoStart: true,
                    enableAutoStop: true,
                },
            }),
        });

        const broadcast = await broadcastRes.json();
        if (broadcast.error) {
            throw new Error(broadcast.error.message || 'Broadcast作成エラー');
        }

        state.ytBroadcastId = broadcast.id;
        log(`Broadcast作成完了: ${broadcast.id}`, 'success');

        // 2. Stream を作成
        const streamRes = await fetch(`${YOUTUBE_API_BASE}/liveStreams?part=snippet,cdn`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.ytAccessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                snippet: {
                    title: '豚ライブ配信ストリーム',
                },
                cdn: {
                    frameRate: '30fps',
                    ingestionType: 'rtmp',
                    resolution: '720p',
                },
            }),
        });

        const stream = await streamRes.json();
        if (stream.error) {
            throw new Error(stream.error.message || 'Stream作成エラー');
        }

        state.ytStreamId = stream.id;
        const rtmpUrl = stream.cdn?.ingestionInfo?.ingestionAddress;
        const streamKey = stream.cdn?.ingestionInfo?.streamName;

        log(`Stream作成完了: ${stream.id}`, 'success');
        if (rtmpUrl && streamKey) {
            log(`RTMP URL: ${rtmpUrl}`, 'info');
            log(`ストリームキー: ${streamKey}`, 'info');
        }

        // 3. Bind
        const bindRes = await fetch(`${YOUTUBE_API_BASE}/liveBroadcasts/bind?id=${state.ytBroadcastId}&part=id,contentDetails&streamId=${state.ytStreamId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.ytAccessToken}` },
        });

        const bindData = await bindRes.json();
        if (bindData.error) {
            throw new Error(bindData.error.message || 'Bind エラー');
        }

        state.isStreaming = true;
        updateStreamUI();
        log('✅ YouTube Live 配信を準備しました！', 'success');
        notify('YouTube Live 配信を準備しました', 'success');

    } catch (err) {
        log(`YouTube Live エラー: ${err.message}`, 'error');
        notify(`配信エラー: ${err.message}`, 'error');
    }
}

async function stopYouTubeStream() {
    if (!state.ytBroadcastId) return;

    try {
        // Transition to complete
        await fetch(`${YOUTUBE_API_BASE}/liveBroadcasts/transition?broadcastStatus=complete&id=${state.ytBroadcastId}&part=id,status`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.ytAccessToken}` },
        });

        state.isStreaming = false;
        state.ytBroadcastId = null;
        state.ytStreamId = null;
        updateStreamUI();
        log('⏹ YouTube Live 配信を停止しました', 'info');
        notify('配信を停止しました', 'success');
    } catch (err) {
        log(`配信停止エラー: ${err.message}`, 'error');
    }
}

function updateStreamUI() {
    if (state.isStreaming) {
        dom.ytStreamStatus.textContent = '配信中';
        dom.ytStreamStatus.style.color = 'var(--accent)';
        dom.btnStartStream.style.display = 'none';
        dom.btnStopStream.style.display = '';
        dom.streamBadge.textContent = 'LIVE';
        dom.streamBadge.className = 'stream-badge live';
    } else {
        dom.ytStreamStatus.textContent = '停止中';
        dom.ytStreamStatus.style.color = '';
        dom.btnStartStream.style.display = '';
        dom.btnStopStream.style.display = 'none';
        dom.streamBadge.textContent = state.ytAccessToken ? '接続済み' : '未接続';
        dom.streamBadge.className = state.ytAccessToken ? 'stream-badge connected' : 'stream-badge';
    }
}

// ===== UI更新 =====

function updateUI() {
    updateStatusUI(state.monitoring ? 'monitoring' : 'idle');
    updateMonitorButton();
    updateStreamUI();
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
