/*
 * MinIO Filelink Provider - Interface de configuration
 * Gestion multi-comptes via Thunderbird cloudFile API
 */

// ==========================================
// INITIALISATION
// ==========================================
let currentAccountId = null;
document.addEventListener('DOMContentLoaded', function () {
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
		// Paramètres multipart
		multipartThreshold: document.getElementById('multipartThreshold'),
		chunkSize: document.getElementById('chunkSize'),
		concurrentUploads: document.getElementById('concurrentUploads'),
		timeout: document.getElementById('timeout'),
		retryCount: document.getElementById('retryCount'),
		retryDelay: document.getElementById('retryDelay'),
		generatePresignedUrl: document.getElementById('generatePresignedUrl'),
		linkExpiry: document.getElementById('linkExpiry'),
		// Boutons
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
			uploadSizeLimit: els.uploadSizeLimit ? parseInt(els.uploadSizeLimit.value) || -1 : -1,
			// Paramètres multipart
			multipartThreshold: els.multipartThreshold ? parseInt(els.multipartThreshold.value) * 1024 * 1024 : 5 * 1024 * 1024,
			chunkSize: els.chunkSize ? parseInt(els.chunkSize.value) * 1024 * 1024 : 5 * 1024 * 1024,
			concurrentUploads: els.concurrentUploads ? parseInt(els.concurrentUploads.value) : 3,
			timeout: els.timeout ? parseInt(els.timeout.value) * 1000 : 60000,
			retryCount: els.retryCount ? parseInt(els.retryCount.value) : 3,
			retryDelay: els.retryDelay ? parseInt(els.retryDelay.value) : 1000,
			// Nouveaux champs
			generatePresignedUrl: els.generatePresignedUrl ? els.generatePresignedUrl.checked : true,
			linkExpiry: els.linkExpiry ? parseInt(els.linkExpiry.value) * 24 * 60 * 60 : 7 * 24 * 60 * 60 // conversion jours → secondes
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
		// Paramètres multipart (conversion octets → MB pour l'affichage)
		if (els.multipartThreshold) els.multipartThreshold.value = (data.multipartThreshold || 5 * 1024 * 1024) / 1024 / 1024;
		if (els.chunkSize) els.chunkSize.value = (data.chunkSize || 5 * 1024 * 1024) / 1024 / 1024;
		if (els.concurrentUploads) els.concurrentUploads.value = data.concurrentUploads || 3;
		if (els.timeout) els.timeout.value = (data.timeout || 60000) / 1000;
		if (els.retryCount) els.retryCount.value = data.retryCount || 3;
		if (els.retryDelay) els.retryDelay.value = data.retryDelay || 1000;
		if (els.generatePresignedUrl) els.generatePresignedUrl.checked = data.generatePresignedUrl !== undefined ? data.generatePresignedUrl : true;
		if (els.linkExpiry) els.linkExpiry.value = (data.linkExpiry || 7 * 24 * 60 * 60) / 24 / 60 / 60; // conversion secondes → jours
	}

	function validateForm(data) {
		if (!data.endpoint) return 'L\'endpoint est requis';
		if (!data.bucketName) return 'Le bucket est requis';
		if (!data.accessKeyId) return 'L\'access key est requise';
		if (!data.secretAccessKey) return 'La secret key est requise';
		// Validation des paramètres multipart
		if (data.multipartThreshold < 1 * 1024 * 1024) return 'Le seuil multipart doit être d\'au moins 1MB';
		if (data.chunkSize < 1 * 1024 * 1024) return 'La taille des chunks doit être d\'au moins 1MB';
		if (data.concurrentUploads < 1 || data.concurrentUploads > 10) return 'Les uploads concurrents doivent être entre 1 et 10';
		if (data.timeout < 10000) return 'Le timeout doit être d\'au moins 10 secondes';
		if (data.retryCount < 0 || data.retryCount > 10) return 'Le nombre de tentatives doit être entre 0 et 10';
		if (data.retryDelay < 500) return 'Le délai entre tentatives doit être d\'au moins 500ms';
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
				// Valeurs par défaut
				fillForm({
					useSSL: false,
					region: 'us-east-1',
					multipartThreshold: 5 * 1024 * 1024,
					chunkSize: 5 * 1024 * 1024,
					concurrentUploads: 3,
					timeout: 60000,
					retryCount: 3,
					retryDelay: 1000
				});
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