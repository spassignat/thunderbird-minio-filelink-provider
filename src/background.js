/*
 * MinIO Filelink Provider - Background
 * Service worker pour Thunderbird
 */

// ==========================================
// LOGGER
// ==========================================

const log = (...args) => console.log('[MinIO]', ...args);
const logError = (...args) => console.error('[MinIO]', ...args);

async function getAccount(accountId) {
    const accountInfo = await browser.storage.local.get(accountId);
    if (!accountInfo[accountId] || !("endpoint" in accountInfo[accountId])) {
        throw new Error("ERR_ACCOUNT_NOT_FOUND");
    }
    return accountInfo[accountId];
}

// ==========================================
// CLIENT MINIO - ALIGNE SUR LA VERSION NODE OK
// ==========================================

class MinioClient {
    constructor(config) {
        this.config = {
            endpoint: config.endpoint,
            bucket: config.bucket,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
            useSSL: config.useSSL ?? false,
            usePathStyle: config.usePathStyle ?? true,
            region: config.region || 'us-east-1'
        };
    }

    getHost() {
        return this.config.endpoint.replace(/^https?:\/\//, '');
    }

    buildUrl(key) {
        const protocol = this.config.useSSL ? 'https' : 'http';
        const host = this.getHost();
        const path = `/${this.config.bucket}/${key}`;
        return `${protocol}://${host}${path}`;
    }

    async sha256(data) {
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async sha256String(str) {
        const encoder = new TextEncoder();
        return await this.sha256(encoder.encode(str));
    }

    async hmacSha256(key, message) {
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            {name: 'HMAC', hash: 'SHA-256'},
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC',
            cryptoKey,
            encoder.encode(message)
        );

        return new Uint8Array(signature);
    }

    async generateSignature(secretKey, date, region, stringToSign) {
        const encoder = new TextEncoder();

        const kDate = await this.hmacSha256(encoder.encode('AWS4' + secretKey), date);
        const kRegion = await this.hmacSha256(kDate, region);
        const kService = await this.hmacSha256(kRegion, 's3');
        const kSigning = await this.hmacSha256(kService, 'aws4_request');
        const signature = await this.hmacSha256(kSigning, stringToSign);

        return Array.from(signature)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async prepareRequest(content, key) {
        const host = this.getHost();
        const url = this.buildUrl(key);
        const method = 'PUT';

        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const date = amzDate.slice(0, 8);

        // 1. Hash du payload
        const payloadHash = await this.sha256(content);

        // 2. URI canonique
        const canonicalUri = `/${this.config.bucket}/${key}`;
        const canonicalQueryString = '';

        // 3. Headers a signer - identiques a la version Node.js
        const contentType = 'application/octet-stream';
        const headersToSign = {
            'host': host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'content-type': contentType
        };

        // Tri alphabetique comme dans la version Node
        const sortedHeaders = Object.entries(headersToSign).sort((a, b) => a[0].localeCompare(b[0]));
        const canonicalHeaders = sortedHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
        const signedHeaders = sortedHeaders.map(([k]) => k).join(';');

        // 4. Requete canonique
        const canonicalRequest =
            `${method}\n` +
            `${canonicalUri}\n` +
            `${canonicalQueryString}\n` +
            `${canonicalHeaders}\n` +
            `${signedHeaders}\n` +
            `${payloadHash}`;

        log('📝 Requete canonique:');
        log(canonicalRequest);

        // 5. Hash de la requete canonique
        const hashedCanonical = await this.sha256String(canonicalRequest);

        // 6. String to sign
        const region = this.config.region;
        const stringToSign =
            `AWS4-HMAC-SHA256\n` +
            `${amzDate}\n` +
            `${date}/${region}/s3/aws4_request\n` +
            `${hashedCanonical}`;

        log('🔑 String to sign:');
        log(stringToSign);

        // 7. Signature
        const signature = await this.generateSignature(
            this.config.secretKey,
            date,
            region,
            stringToSign
        );

        // 8. Authorization
        const auth =
            `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}/${date}/${region}/s3/aws4_request, ` +
            `SignedHeaders=${signedHeaders}, ` +
            `Signature=${signature}`;

        log('🔐 Authorization:');
        log(auth);

        // 9. Headers finaux
        const finalHeaders = {
            'Host': host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'Authorization': auth,
            'Content-Type': contentType,
            'Content-Length': String(content.byteLength ?? content.length)
        };

        log('📋 Headers finaux:');
        Object.entries(finalHeaders).forEach(([k, v]) => {
            if (k === 'Authorization') {
                log(`  ${k}: ${v.substring(0, 120)}...`);
            } else {
                log(`  ${k}: ${v}`);
            }
        });

        return {url, headers: finalHeaders, payloadHash};
    }

    async upload(content, key) {
        try {
            const req = await this.prepareRequest(content, key);

            log(`📤 Upload: ${key} (${content.byteLength ?? content.length} octets)`);
            log(`🌐 URL: ${req.url}`);

            const response = await fetch(req.url, {
                method: 'PUT',
                headers: req.headers,
                body: content
            });

            let responseText = '';
            try {
                responseText = await response.text();
            } catch (e) {
            }

            log(`📊 Status: ${response.status} ${response.statusText}`);

            if (responseText) {
                log('📄 Reponse:', responseText);
            }

            if (!response.ok) {
                throw new Error(`[${response.status}] ${responseText || response.statusText}`);
            }

            log(`✅ Upload reussi: ${key}`);
            return {key, url: req.url, status: response.status};

        } catch (error) {
            logError(`❌ Erreur: ${error.message}`);
            throw error;
        }
    }

    async test() {
        log('🧪 Test de connexion...');
        const encoder = new TextEncoder();
        const content = encoder.encode(`Test MinIO - ${new Date().toISOString()}`);
        const key = `test-${Date.now()}.txt`;
        return await this.upload(content, key);
    }
}

// ==========================================
// GESTION DE LA CONFIGURATION
// ==========================================

async function getConfig() {
    const result = await browser.storage.local.get('minioConfig');
    return result.minioConfig || null;
}

// ==========================================
// GESTIONNAIRES
// ==========================================

async function handleUpload(file, account) {
    if (!account || Object.keys(account).length === 0) {
        account = await getConfig();
        if (!account) {
            throw new Error('Configuration non trouvee. Veuillez configurer le plugin dans les options.');
        }
    }

    const client = new MinioClient({
        endpoint: account.endpoint,
        bucket: account.bucketName,
        accessKey: account.accessKeyId,
        secretKey: account.secretAccessKey,
        useSSL: account.useSSL || false,
        usePathStyle: true,
        region: account.region || 'us-east-1'
    });

    const content = await file.arrayBuffer();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${Date.now()}-${safeName}`;

    return await client.upload(new Uint8Array(content), key);
}

async function handleTest(account) {
    const client = new MinioClient({
        endpoint: account.endpoint,
        bucket: account.bucketName,
        accessKey: account.accessKeyId,
        secretKey: account.secretAccessKey,
        useSSL: account.useSSL || false,
        usePathStyle: true,
        region: account.region || 'us-east-1'
    });

    return await client.test();
}

// ==========================================
// GESTION DES MESSAGES
// ==========================================

browser.runtime.onMessage.addListener(async (msg, sender) => {
    log(`📨 Message: ${msg.type}`);

    try {
        switch (msg.type) {
            case 'upload': {
                const uploadResult = await handleUpload(msg.file, msg.account);
                return {success: true, data: uploadResult};
            }

            case 'test': {
                const testResult = await handleTest(msg.account);
                return {success: true, data: testResult};
            }

            case 'getConfig': {
                const config = await getConfig();
                return {success: true, data: config};
            }

            case 'settingsUpdated': {
                await browser.storage.local.set({minioConfig: msg.config});
                log('✅ Parametres sauvegardes');
                return {success: true};
            }

            default:
                return {success: false, error: 'Type de message inconnu'};
        }
    } catch (error) {
        logError(`❌ Erreur: ${error.message}`);
        logError(error.stack);
        return {success: false, error: error.message};
    }
});

// ==========================================
// INITIALISATION
// ==========================================

log('🚀 MinIO Filelink Provider charge');
log('📌 Version: 1.0.0');
