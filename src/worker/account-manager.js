/*
 * MinIO Account Manager - Gestion des comptes
 * Stockage et manipulation des comptes MinIO
 */
// ==========================================
// CONSTANTES
// ==========================================
const STORAGE_KEY = 'minioAccounts';
// ==========================================
// LOGGER
// ==========================================
const accountLog = (...args) => console.log('[Account Manager]', ...args);
const accountLogError = (...args) => console.error('[Account Manager]', ...args);
// ==========================================
// GESTION DES COMPTES
// ==========================================
class AccountManager {
	constructor(storage) {
		this.storage = storage || browser.storage.local;
	}

	/**
	 * Récupère tous les comptes stockés
	 */
	async getAllAccounts() {
		const result = await this.storage.get(STORAGE_KEY);
		return result[STORAGE_KEY] || {};
	}

	/**
	 * Sauvegarde tous les comptes
	 */
	async saveAccounts(accounts) {
		await this.storage.set({[STORAGE_KEY]: accounts});
	}

	/**
	 * Récupère un compte par son ID
	 */
	async getAccount(accountId) {
		const accounts = await this.getAllAccounts();
		if (!accounts[accountId]) {
			return undefined;
		}
		return accounts[accountId];
	}

	/**
	 * Vérifie si un compte existe
	 */
	async accountExists(accountId) {
		const accounts = await this.getAllAccounts();
		return !!accounts[accountId];
	}

	/**
	 * Crée un nouveau compte
	 */
	async createAccount(accountId, accountData) {
		if (!accountId || !accountId.trim()) {
			throw new Error('ERR_INVALID_ACCOUNT_ID: L\'ID du compte est requis');
		}
		const accounts = await this.getAllAccounts();
		if (accounts[accountId]) {
			throw new Error(`ERR_ACCOUNT_ALREADY_EXISTS: ${accountId}`);
		}
		// Validation des champs obligatoires
		const required = ['endpoint', 'bucketName', 'accessKeyId', 'secretAccessKey'];
		for (const field of required) {
			if (!accountData[field] || !accountData[field].trim()) {
				throw new Error(`ERR_MISSING_FIELD: ${field} est requis`);
			}
		}
		// Nettoyage des données
		const cleanedData = {
			endpoint: accountData.endpoint.trim(),
			bucketName: accountData.bucketName.trim(),
			accessKeyId: accountData.accessKeyId.trim(),
			secretAccessKey: accountData.secretAccessKey.trim(),
			useSSL: accountData.useSSL || false,
			region: accountData.region || 'us-east-1',
			customUrl: accountData.customUrl || '',
			uploadSizeLimit: accountData.uploadSizeLimit || -1,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		accounts[accountId] = cleanedData;
		await this.saveAccounts(accounts);
		accountLog(`✅ Compte créé: ${accountId}`);
		return {success: true, accountId, data: cleanedData};
	}

	/**
	 * Met à jour un compte existant
	 */
	async updateAccount(accountId, accountData) {
		if (!accountId || !accountId.trim()) {
			throw new Error('ERR_INVALID_ACCOUNT_ID: L\'ID du compte est requis');
		}
		const accounts = await this.getAllAccounts();
		if (!accounts[accountId]) {
			throw new Error(`ERR_ACCOUNT_NOT_FOUND: ${accountId}`);
		}
		// Validation des champs obligatoires
		const required = ['endpoint', 'bucketName', 'accessKeyId', 'secretAccessKey'];
		for (const field of required) {
			if (!accountData[field] || !accountData[field].trim()) {
				throw new Error(`ERR_MISSING_FIELD: ${field} est requis`);
			}
		}
		// Mise à jour des données
		accounts[accountId] = {
			...accounts[accountId],
			endpoint: accountData.endpoint.trim(),
			bucketName: accountData.bucketName.trim(),
			accessKeyId: accountData.accessKeyId.trim(),
			secretAccessKey: accountData.secretAccessKey.trim(),
			useSSL: accountData.useSSL !== undefined ? accountData.useSSL : accounts[accountId].useSSL,
			region: accountData.region || accounts[accountId].region || 'us-east-1',
			managementUrl: accountData.managementUrl !== undefined ? accountData.managementUrl : accounts[accountId].managementUrl || browser.runtime.getURL('management.html'),
			customUrl: accountData.customUrl !== undefined ? accountData.customUrl : accounts[accountId].customUrl || '',
			uploadSizeLimit: accountData.uploadSizeLimit !== undefined ? accountData.uploadSizeLimit : accounts[accountId].uploadSizeLimit || -1,
			updatedAt: Date.now()
		};
		await this.saveAccounts(accounts);
		accountLog(`✅ Compte mis à jour: ${accountId}`);
		return {success: true, accountId, data: accounts[accountId]};
	}

	/**
	 * Supprime un compte
	 */
	async deleteAccount(accountId) {
		if (!accountId || !accountId.trim()) {
			throw new Error('ERR_INVALID_ACCOUNT_ID: L\'ID du compte est requis');
		}
		const accounts = await this.getAllAccounts();
		if (!accounts[accountId]) {
			throw new Error(`ERR_ACCOUNT_NOT_FOUND: ${accountId}`);
		}
		delete accounts[accountId];
		await this.saveAccounts(accounts);
		accountLog(`🗑️ Compte supprimé: ${accountId}`);
		return {success: true, accountId};
	}

	/**
	 * Récupère le compte par défaut
	 */
	async getDefaultAccount() {
		const accounts = await this.getAllAccounts();
		const keys = Object.keys(accounts);
		if (keys.length === 0) {
			return null;
		}
		// Si un compte est marqué comme défaut, le retourner
		for (const key of keys) {
			if (accounts[key].isDefault) {
				return accounts[key];
			}
		}
		// Sinon retourner le premier compte
		return accounts[keys[0]];
	}

	/**
	 * Récupère l'ID du compte par défaut
	 */
	async getDefaultAccountId() {
		const accounts = await this.getAllAccounts();
		const keys = Object.keys(accounts);
		if (keys.length === 0) {
			return null;
		}
		// Si un compte est marqué comme défaut, retourner son ID
		for (const key of keys) {
			if (accounts[key].isDefault) {
				return key;
			}
		}
		// Sinon retourner le premier ID
		return keys[0];
	}

	/**
	 * Définit un compte comme défaut
	 */
	async setDefaultAccount(accountId) {
		const accounts = await this.getAllAccounts();
		if (!accounts[accountId]) {
			throw new Error(`ERR_ACCOUNT_NOT_FOUND: ${accountId}`);
		}
		// Retirer le flag de tous les comptes
		for (const key of Object.keys(accounts)) {
			accounts[key].isDefault = false;
		}
		// Ajouter le flag au compte sélectionné
		accounts[accountId].isDefault = true;
		await this.saveAccounts(accounts);
		accountLog(`⭐ Compte défini comme défaut: ${accountId}`);
		return {success: true, accountId};
	}

	/**
	 * Valide les données d'un compte
	 */
	validateAccountData(data) {
		const required = ['endpoint', 'bucketName', 'accessKeyId', 'secretAccessKey'];
		for (const field of required) {
			if (!data[field] || !data[field].trim()) {
				return {valid: false, error: `ERR_MISSING_FIELD: ${field} est requis`};
			}
		}
		return {valid: true};
	}

	/**
	 * Compte les comptes
	 */
	async countAccounts() {
		const accounts = await this.getAllAccounts();
		return Object.keys(accounts).length;
	}

	/**
	 * Liste les IDs des comptes
	 */
	async listAccountIds() {
		const accounts = await this.getAllAccounts();
		return Object.keys(accounts);
	}
}

// ==========================================
// EXPORT
// ==========================================
export default AccountManager;
