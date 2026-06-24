/*
 * MinIO Filelink Provider - Interface de configuration
 * Gestion multi-comptes via Thunderbird cloudFile API
 */

// ==========================================
// LOGGER
// ==========================================

const log = (...args) => console.log('[UI]', ...args);
const logError = (...args) => console.error('[UI]', ...args);

// ==========================================
// INITIALISATION
// ==========================================

let currentAccountId = null;

document.addEventListener('DOMContentLoaded', function() {
    log('✅ DOM chargé, initialisation...');

    // Récupérer l'ID du compte depuis l'URL
    const urlParams = new URLSearchParams(window.location.search);
    currentAccountId = urlParams.get('accountId');

    if (!currentAccountId) {
        document.getElementById('status').textContent = '❌ Aucun compte spécifié';
        document.getElementById('status').className = 'status error';
        document.getElementById('status').style.display = 'block';
        return;
    }

    log(`📌 Compte: ${currentAccountId}`);
    init(currentAccountId);
});

function init(accountId) {
    // Récupérer les éléments
    const els = {
        endpoint: document.getElementById('endpoint'),
        bucket: document.getElementById('bucket'),
        accessKeyId: document.getElementById('accessKeyId'),
        secretAccessKey: document.getElementById('secretAccessKey'),
        useSSL: document.getElementById('useSSL'),
        region: document.getElementById('region'),
        customUrl: document.getElementById('customUrl'),
        uploadSizeLimit: document.getElementById('uploadSizeLimit'),
        saveBtn: document.getElementById('saveBtn'),
        testBtn: document.getElementById('testBtn'),
        status: document.getElementById('status'),
        configStatus: document.getElementById('configStatus'),
        accountLabel: document.getElementById('accountLabel')
    };

    // Afficher l'ID du compte
    if (els.accountLabel) {
        els.accountLabel.textContent = `Compte: ${accountId}`;
    }

    // ==========================================
    // UTILITAIRES
    // ==========================================

    function showStatus(msg, type = 'info') {
        if (!els.status) return;
        els.status.textContent = msg;
        els.status.className = `status ${type}`;
        els.status.style.display = 'block';
        if (type === 'success') {
            setTimeout(() => {
                if (els.status) els.status.style.display = 'none';
            }, 10000);
        }
        log(`📊 Status: ${type} - ${msg}`);
    }

    function getFormData() {
        return {
            endpoint: els.endpoint ? els.endpoint.value.trim() : '',
            bucketName: els.bucket ? els.bucket.value.trim() : '',
            accessKeyId: els.accessKeyId ? els.accessKeyId.value.trim() : '',
            secretAccessKey: els.secretAccessKey ? els.secretAccessKey.value.trim() : '',
            useSSL: els.useSSL ? els.useSSL.checked : false,
            region: els.region ? els.region.value.trim() || 'us-east-1' : 'us-east-1',
            customUrl: els.customUrl ? els.customUrl.value.trim() : '',
            uploadSizeLimit: els.uploadSizeLimit ? parseInt(els.uploadSizeLimit.value) || -1 : -1
        };
    }

    function fillForm(data) {
        if (els.endpoint) els.endpoint.value = data.endpoint || '';
        if (els.bucket) els.bucket.value = data.bucketName || '';
        if (els.accessKeyId) els.accessKeyId.value = data.accessKeyId || '';
        if (els.secretAccessKey) els.secretAccessKey.value = data.secretAccessKey || '';
        if (els.useSSL) els.useSSL.checked = data.useSSL || false;
        if (els.region) els.region.value = data.region || 'us-east-1';
        if (els.customUrl) els.customUrl.value = data.customUrl || '';
        if (els.uploadSizeLimit) els.uploadSizeLimit.value = data.uploadSizeLimit || '';
    }

    function validateForm(data) {
        if (!data.endpoint) return 'L\'endpoint est requis';
        if (!data.bucketName) return 'Le bucket est requis';
        if (!data.accessKeyId) return 'L\'access key est requise';
        if (!data.secretAccessKey) return 'La secret key est requise';
        return null;
    }

    // ==========================================
    // MISE À JOUR DU STATUT
    // ==========================================

    async function updateConfigStatus() {
        try {
            const response = await browser.runtime.sendMessage({
                type: 'isConfigured',
                accountId: accountId
            });

            if (els.configStatus) {
                if (response.success && response.data) {
                    els.configStatus.textContent = '✅ Configuré';
                    els.configStatus.className = 'config-status configured';
                } else {
                    els.configStatus.textContent = '❌ Non configuré';
                    els.configStatus.className = 'config-status not-configured';
                }
            }
        } catch (error) {
            logError('❌ Erreur lors de la vérification du statut:', error);
        }
    }

    // ==========================================
    // CHARGEMENT DE LA CONFIGURATION
    // ==========================================

    async function loadConfig() {
        try {
            log(`Chargement de la configuration pour ${accountId}...`);
            const response = await browser.runtime.sendMessage({
                type: 'getConfig',
                accountId: accountId
            });

            if (response.success && response.data) {
                fillForm(response.data);
                log('✅ Configuration chargée');
            } else {
                log('ℹ️ Aucune configuration trouvée');
            }

            await updateConfigStatus();
        } catch (error) {
            logError('❌ Erreur de chargement:', error);
            showStatus(`❌ Erreur de chargement: ${error.message}`, 'error');
        }
    }

    // ==========================================
    // SAUVEGARDE
    // ==========================================

    async function save() {
        log(`💾 Sauvegarde pour ${accountId}...`);

        const data = getFormData();
        log('Données du formulaire:', data);

        const validationError = validateForm(data);
        if (validationError) {
            showStatus(`❌ ${validationError}`, 'error');
            return;
        }

        try {
            const response = await browser.runtime.sendMessage({
                type: 'saveConfig',
                accountId: accountId,
                config: data
            });

            log('Réponse du background:', response);

            if (response.success) {
                showStatus('✅ Configuration sauvegardée !', 'success');
                await updateConfigStatus();
            } else {
                showStatus(`❌ Erreur: ${response.error}`, 'error');
            }
        } catch (error) {
            logError('❌ Erreur de sauvegarde:', error);
            showStatus(`❌ Erreur: ${error.message}`, 'error');
        }
    }

    // ==========================================
    // TEST
    // ==========================================

    async function testConnection() {
        log(`🔍 Test de connexion pour ${accountId}...`);

        showStatus('⏳ Test en cours...', 'info');

        try {
            const response = await browser.runtime.sendMessage({
                type: 'test',
                accountId: accountId
            });

            log('Réponse du test:', response);

            if (response.success) {
                showStatus(`✅ Test réussi ! Fichier: ${response.data.key}`, 'success');
            } else {
                showStatus(`❌ Échec: ${response.error}`, 'error');
            }
        } catch (error) {
            logError('❌ Erreur de test:', error);
            showStatus(`❌ Erreur: ${error.message}`, 'error');
        }
    }

    // ==========================================
    // ÉVÉNEMENTS
    // ==========================================

    if (els.saveBtn) {
        els.saveBtn.addEventListener('click', save);
        log('✅ Événement saveBtn attaché');
    }

    if (els.testBtn) {
        els.testBtn.addEventListener('click', testConnection);
        log('✅ Événement testBtn attaché');
    }

    // Raccourci Entrée
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            }
        });
    });

    // ==========================================
    // CHARGEMENT INITIAL
    // ==========================================

    loadConfig().then(() => {
        log(`✅ Interface chargée pour le compte ${accountId}`);
    }).catch(error => {
        logError('❌ Erreur lors du chargement initial:', error);
        showStatus(`❌ Erreur de chargement: ${error.message}`, 'error');
    });
}