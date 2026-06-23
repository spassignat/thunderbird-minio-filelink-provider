/*
 * MinIO Filelink Provider - Interface de configuration
 */

// ==========================================
// LOGGER
// ==========================================

const log = (...args) => console.log('[UI]', ...args);

// ==========================================
// ÉLÉMENTS DU FORMULAIRE
// ==========================================

const els = {
    endpoint: document.getElementById('endpoint'),
    bucket: document.getElementById('bucket'),
    accessKey: document.getElementById('accessKey'),
    secretKey: document.getElementById('secretKey'),
    useSSL: document.getElementById('useSSL'),
    region: document.getElementById('region'),
    customUrl: document.getElementById('customUrl'),
    save: document.getElementById('save'),
    test: document.getElementById('test'),
    status: document.getElementById('status')
};

// ==========================================
// UTILITAIRES
// ==========================================

function showStatus(msg, type = 'info') {
    els.status.textContent = msg;
    els.status.className = `status ${type}`;
    els.status.style.display = 'block';
    if (type === 'success') {
        setTimeout(() => { els.status.style.display = 'none'; }, 10000);
    }
}

// ==========================================
// CHARGEMENT DE LA CONFIGURATION
// ==========================================

async function loadConfig() {
    try {
        log('Chargement de la configuration...');
        const response = await browser.runtime.sendMessage({ type: 'getConfig' });

        if (response.success && response.data) {
            const c = response.data;
            els.endpoint.value = c.endpoint || '';
            els.bucket.value = c.bucketName || '';
            els.accessKey.value = c.accessKeyId || '';
            els.secretKey.value = c.secretAccessKey || '';
            els.useSSL.checked = c.useSSL || false;
            els.region.value = c.region || 'us-east-1';
            els.customUrl.value = c.customUrl || '';
            log('✅ Configuration chargée');
        } else {
            log('ℹ️ Aucune configuration trouvée');
        }
    } catch (error) {
        logError('❌ Erreur de chargement:', error);
    }
}

// ==========================================
// SAUVEGARDE
// ==========================================

async function saveConfig() {
    const config = {
        endpoint: els.endpoint.value.trim(),
        bucketName: els.bucket.value.trim(),
        accessKeyId: els.accessKey.value.trim(),
        secretAccessKey: els.secretKey.value.trim(),
        useSSL: els.useSSL.checked,
        region: els.region.value.trim() || 'us-east-1',
        customUrl: els.customUrl.value.trim()
    };

    if (!config.endpoint || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
        showStatus('❌ Tous les champs obligatoires doivent être remplis', 'error');
        return;
    }

    try {
        log('Sauvegarde...');
        await browser.runtime.sendMessage({ type: 'settingsUpdated', config });
        showStatus('✅ Paramètres sauvegardés !', 'success');
    } catch (error) {
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}

// ==========================================
// TEST
// ==========================================

async function testConnection() {
    const config = {
        endpoint: els.endpoint.value.trim(),
        bucketName: els.bucket.value.trim(),
        accessKeyId: els.accessKey.value.trim(),
        secretAccessKey: els.secretKey.value.trim(),
        useSSL: els.useSSL.checked,
        region: els.region.value.trim() || 'us-east-1',
        customUrl: els.customUrl.value.trim()
    };

    if (!config.endpoint || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
        showStatus('❌ Remplissez tous les champs', 'error');
        return;
    }

    showStatus('⏳ Test en cours...', 'info');

    try {
        log('Test de connexion...');
        const response = await browser.runtime.sendMessage({ type: 'test', account: config });

        if (response.success) {
            showStatus(`✅ Test réussi ! Fichier: ${response.data.key}`, 'success');
        } else {
            showStatus(`❌ Échec: ${response.error}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}

// ==========================================
// ÉVÉNEMENTS
// ==========================================

document.addEventListener('DOMContentLoaded', loadConfig);

els.save.addEventListener('click', saveConfig);
els.test.addEventListener('click', testConnection);

document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keypress', e => {
        if (e.key === 'Enter') saveConfig();
    });
});

log('✅ Interface chargée');