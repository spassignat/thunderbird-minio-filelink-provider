/*
 * MinIO Filelink Provider - Background
 * Service worker pour Thunderbird
 * Fait l'interface avec TB
 */

// ==========================================
// IMPORT
// ==========================================

// AccountManager est disponible globalement via le script importé

// ==========================================
// LOGGER
// ==========================================

const log = (...args) => console.log('[MinIO]', ...args);
const logError = (...args) => console.error('[MinIO]', ...args);

// ==========================================
// INITIALISATION DU GESTIONNAIRE DE COMPTES
// ==========================================
/**
 *
 * @type {AccountManager}
 */
const accountManager = logClass(new AccountManager(), "AccountManager");
// ==========================================
// GESTION DE LA CONFIGURATION PAR COMPTE
// ==========================================

/**
 * Récupère la configuration pour un compte spécifique
 */
async function getConfig(accountId) {
    try {
        return await accountManager.getAccount(accountId);
    } catch (error) {
        log(`⚠️ Aucune configuration trouvée pour ${accountId}`);
        return null;
    }
}

/**
 * Sauvegarde la configuration pour un compte spécifique
 */
async function saveConfig(accountId, config) {
    try {
        const exists = await accountManager.accountExists(accountId);
        if (exists) {
            await accountManager.updateAccount(accountId, config);
        } else {
            await accountManager.createAccount(accountId, config);
        }
        log(`✅ Configuration sauvegardée pour le compte ${accountId}`);
        return config;
    } catch (error) {
        logError(`❌ Erreur lors de la sauvegarde:`, error);
        throw error;
    }
}

/**
 * Supprime la configuration d'un compte
 */
async function deleteConfig(accountId) {
    try {
        await accountManager.deleteAccount(accountId);
        log(`🗑️ Configuration supprimée pour le compte ${accountId}`);
        return true;
    } catch (error) {
        logError(`❌ Erreur lors de la suppression:`, error);
        return false;
    }
}
/**
 * Vérifie si un compte est configuré
 */
async function isAccountConfigured(accountId) {
    try {
        const config = await accountManager.getAccount(accountId);
        const configured = !!(config &&
            config.endpoint &&
            config.bucketName &&
            config.accessKeyId &&
            config.secretAccessKey);
        log(`🔍 Compte ${accountId}: ${configured ? '✅ Configuré' : '❌ Non configuré'}`);
        return configured;
    } catch (error) {
        return false;
    }
}

// ==========================================
// GESTION DES COMPTES THUNDERBIRD
// ==========================================

/**
 * Met à jour les informations d'un compte dans Thunderbird
 */
async function updateAccountInfo(accountId) {
    try {
        const configured = await isAccountConfigured(accountId);
        const config = await getConfig(accountId);

        // Récupérer les informations de l'API Thunderbird
        const account = await browser.cloudFile.getAccount(accountId);
        if (!account) {
            log(`⚠️ Compte Thunderbird ${accountId} non trouvé`);
            return;
        }

        // Mettre à jour le compte
        await browser.cloudFile.updateAccount(accountId, {
            configured: configured,
            managementUrl: browser.runtime.getURL('management.html'),
            uploadSizeLimit: config?.uploadSizeLimit || -1,
            spaceUsed: -1,
            spaceRemaining: -1
        });

        log(`✅ Compte ${accountId} mis à jour: configured=${configured}`);
    } catch (error) {
        logError(`❌ Erreur lors de la mise à jour du compte ${accountId}:`, error);
    }
}

// ==========================================
// GESTIONNAIRES D'UPLOAD
// ==========================================

/**
 * Upload un fichier vers MinIO pour un compte spécifique
 */
async function handleUpload(accountId, file, relatedFileInfo = null) {
    const {config, client} = await createMinioClient(accountId);

    const content = await file.data.arrayBuffer();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Si un fichier lié existe, réutiliser sa clé
    let key;
    if (relatedFileInfo && relatedFileInfo.url) {
        // Extraire la clé de l'URL existante
        const urlParts = relatedFileInfo.url.split('/');
        key = urlParts[urlParts.length - 1];
        log(`♻️ Mise à jour du fichier existant: ${key}`);
    } else {
        key = `${Date.now()}-${safeName}`;
    }

    const result = await client.upload(new Uint8Array(content), key);

    // Si une URL personnalisée est configurée, l'utiliser
    let fileUrl = result.url;
    if (config.customUrl) {
        fileUrl = config.customUrl
            .replace(/{bucket}/g, config.bucketName)
            .replace(/{key}/g, result.key);
    }

    return {
        url: fileUrl,
        key: result.key,
        templateInfo: {
            service_name: 'MinIO',
            service_icon: browser.runtime.getURL('icon64.png'),
            service_url: config.endpoint
        }
    };
}

async function createMinioClient(accountId) {
    const config = await getConfig(accountId);
    if (!config) {
        throw new Error(`Configuration non trouvée pour le compte ${accountId}`);
    }

    // Utilisation du client MinIO pour la suppression
    let minioClient = new MinioClient({
        endpoint: config.endpoint,
        bucket: config.bucketName,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        useSSL: config.useSSL || false,
        usePathStyle: true,
        region: config.region || 'us-east-1'
    });
    /**
     *
     * @type {MinioClient}
     */
    // const client = minioClient;
    const client = logClass(minioClient, "MinioClient");
    return {config, client};
}

/**
 * Supprime un fichier sur MinIO
 */
async function handleDelete(accountId, fileId) {
    const {config, client} = await createMinioClient(accountId);

    // Construction de l'URL de suppression
    const url = client.buildUrl(fileId);

    // Signature S3 pour la suppression
    const method = 'DELETE';
    const host = client.getHost();
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const region = config.region || 'us-east-1';

    // Headers pour la signature
    const headersToSign = {
        'host': host,
        'x-amz-date': amzDate
    };

    const sortedHeaders = Object.entries(headersToSign).sort((a, b) => a[0].localeCompare(b[0]));
    const canonicalHeaders = sortedHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
    const signedHeaders = sortedHeaders.map(([k]) => k).join(';');

    // Requête canonique
    const canonicalUri = `/${config.bucketName}/${fileId}`;
    const canonicalQueryString = '';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const encoder = new TextEncoder();
    const hashedCanonical = await client.sha256String(canonicalRequest);

    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${date}/${region}/s3/aws4_request\n${hashedCanonical}`;

    const signature = await client.generateSignature(
        config.secretAccessKey,
        date,
        region,
        stringToSign
    );

    const auth = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${date}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Exécution de la suppression
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Host': host,
            'x-amz-date': amzDate,
            'Authorization': auth
        }
    });

    if (!response.ok && response.status !== 404) {
        throw new Error(`Erreur lors de la suppression: ${response.status}`);
    }

    log(`🗑️ Fichier supprimé: ${fileId}`);
    return {success: true};
}

/**
 * Renomme un fichier sur MinIO
 */
async function handleRename(accountId, fileId, newName) {
    const {config, client} = await createMinioClient(accountId);


    // 1. Télécharger le fichier existant
    const oldUrl = client.buildUrl(fileId);
    const response = await fetch(oldUrl);
    if (!response.ok) {
        throw new Error(`Impossible de lire le fichier: ${response.status}`);
    }
    const content = await response.arrayBuffer();

    // 2. Upload avec le nouveau nom
    const newKey = `${Date.now()}-${newName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await client.upload(new Uint8Array(content), newKey);

    // 3. Supprimer l'ancien
    await handleDelete(accountId, fileId);

    // 4. Retourner la nouvelle URL
    let fileUrl = result.url;
    if (config.customUrl) {
        fileUrl = config.customUrl
            .replace(/{bucket}/g, config.bucketName)
            .replace(/{key}/g, newKey);
    }

    log(`📝 Fichier renommé: ${fileId} → ${newKey}`);
    return {url: fileUrl};
}

// ==========================================
// GESTION DES ÉVÉNEMENTS CLOUD FILE
// ==========================================

// Écouteur d'ajout de compte
browser.cloudFile.onAccountAdded.addListener(async (account) => {
    log(`📁 Compte ajouté: ${account.id}`);
    await updateAccountInfo(account.id);
});

// Écouteur de suppression de compte
browser.cloudFile.onAccountDeleted.addListener(async (accountId) => {
    log(`🗑️ Compte supprimé: ${accountId}`);
    await deleteConfig(accountId);
});

// Écouteur d'upload
browser.cloudFile.onFileUpload.addListener(async (account, fileInfo, tab, relatedFileInfo) => {
    log(`📤 Upload demandé pour le compte ${account.id}, fichier: ${fileInfo.name}`);

    try {
        const result = await handleUpload(account.id, fileInfo, relatedFileInfo);

        log(`✅ Upload réussi: ${result.url}`);
        return result;
    } catch (error) {
        logError(`❌ Erreur d'upload:`, error);
        return {error: error.message || true};
    }
});

// Écouteur de suppression de fichier
browser.cloudFile.onFileDeleted.addListener(async (account, fileId, tab) => {
    log(`🗑️ Suppression demandée pour le compte ${account.id}, fichier: ${fileId}`);

    try {
        await handleDelete(account.id, fileId);
        log(`✅ Fichier supprimé: ${fileId}`);
        return {success: true};
    } catch (error) {
        logError(`❌ Erreur de suppression:`, error);
        return {error: error.message || true};
    }
});

// Écouteur de renommage de fichier (TB 97+)
if (browser.cloudFile.onFileRename) {
    browser.cloudFile.onFileRename.addListener(async (account, fileId, newName, tab) => {
        log(`📝 Renommage demandé pour le compte ${account.id}, fichier: ${fileId} → ${newName}`);

        try {
            const result = await handleRename(account.id, fileId, newName);
            log(`✅ Fichier renommé: ${result.url}`);
            return result;
        } catch (error) {
            logError(`❌ Erreur de renommage:`, error);
            return {error: error.message || true};
        }
    });
}

// ==========================================
// GESTION DES MESSAGES (Interface UI)
// ==========================================

browser.runtime.onMessage.addListener(async (msg, sender) => {
    log(`📨 Message: ${msg.type}`);

    try {
        switch (msg.type) {
            // ===== Gestion de la configuration pour un compte =====
            case 'getConfig': {
                const config = await getConfig(msg.accountId);
                return {success: true, data: config};
            }

            case 'saveConfig': {
                const config = await saveConfig(msg.accountId, msg.config);
                // Mettre à jour le compte dans Thunderbird
                await updateAccountInfo(msg.accountId);
                return {success: true, data: config};
            }

            case 'isConfigured': {
                const configured = await isAccountConfigured(msg.accountId);
                return {success: true, data: configured};
            }

            case 'deleteConfig': {
                const result = await deleteConfig(msg.accountId);
                return {success: result};
            }

            // ===== Gestion des comptes =====
            case 'listAccounts': {
                const accounts = await accountManager.getAllAccounts();
                return {success: true, data: accounts};
            }

            case 'getDefaultAccount': {
                const defaultId = await accountManager.getDefaultAccountId();
                return {success: true, data: defaultId};
            }

            case 'setDefaultAccount': {
                await accountManager.setDefaultAccount(msg.accountId);
                return {success: true};
            }

            // ===== Test de connexion =====
            case 'test': {
                const {config, client} = await createMinioClient(msg.accountId);


                const result = await client.test();
                return {success: true, data: result};
            }

            default:
                log(`⚠️ Type de message non reconnu: ${msg.type}`);
                return {success: false, error: 'Type de message inconnu'};
        }
    } catch (error) {
        logError(`❌ Erreur: ${error.message}`);
        logError(error.stack);
        return {success: false, error: error.message};
    }
});
