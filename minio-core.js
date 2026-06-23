/*
 * Cœur du client MinIO - Version identique au script Python
 * Fonctionne en Node.js et dans le navigateur
 */

// Détection de l'environnement
const isNode = typeof process !== 'undefined' && process.versions?.node;
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// Import de fetch pour Node.js
let fetch;
if (isNode) {
    try {
        fetch = (await import('node-fetch')).default;
    } catch {
        fetch = globalThis.fetch;
    }
} else {
    fetch = globalThis.fetch;
}

// ==========================================
// LOGGER
// ==========================================

class Logger {
    constructor(prefix = '') {
        this.prefix = prefix;
    }

    log(message, type = 'info') {
        const icons = { error: '❌', success: '✅', warning: '⚠️', info: 'ℹ️', debug: '🔍' };
        const icon = icons[type] || '•';
        const timestamp = new Date().toISOString();
        const msg = `[${timestamp}] ${icon} ${message}`;

        if (type === 'error') {
            console.error(msg);
        } else if (type === 'warning') {
            console.warn(msg);
        } else {
            console.log(msg);
        }
        return msg;
    }

    info(msg) { return this.log(msg, 'info'); }
    success(msg) { return this.log(msg, 'success'); }
    error(msg) { return this.log(msg, 'error'); }
    warning(msg) { return this.log(msg, 'warning'); }
    debug(msg) { return this.log(msg, 'debug'); }
}

// ==========================================
// CLIENT MINIO - IDENTIQUE AU PYTHON
// ==========================================

export class MinioClient {
    constructor(config) {
        this.config = {
            endpoint: config.endpoint || 'localhost:9000',
            bucket: config.bucket || 'test',
            accessKey: config.accessKey || 'minioadmin',
            secretKey: config.secretKey || 'minioadmin',
            useSSL: config.useSSL !== undefined ? config.useSSL : false,
            usePathStyle: config.usePathStyle !== undefined ? config.usePathStyle : true,
            region: config.region || 'us-east-1'
        };
        this.logger = new Logger();
    }

    // Normalise l'endpoint (enlève http:// ou https://)
    getHost() {
        let endpoint = this.config.endpoint.replace(/^https?:\/\//, '');
        return endpoint;
    }

    // Construit l'URL
    buildUrl(key) {
        const protocol = this.config.useSSL ? 'https' : 'http';
        const host = this.getHost();
        const path = `/${this.config.bucket}/${key}`;
        return `${protocol}://${host}${path}`;
    }

    // SHA256 pour les données - IDENTIQUE au Python
    async sha256(data) {
        if (isNode) {
            const crypto = await import('crypto');
            return crypto.createHash('sha256').update(data).digest('hex');
        }
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // HMAC-SHA256 - IDENTIQUE au Python
    async hmacSha256(key, message) {
        if (isNode) {
            const crypto = await import('crypto');
            return crypto.createHmac('sha256', key).update(message).digest();
        }
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
    }

    // Génère la signature AWS V4 - IDENTIQUE au Python
    async generateSignature(secretKey, date, region, stringToSign) {
        const encoder = new TextEncoder();
        const kDate = await this.hmacSha256(encoder.encode('AWS4' + secretKey), date);
        const kRegion = await this.hmacSha256(kDate, region);
        const kService = await this.hmacSha256(kRegion, 's3');
        const kSigning = await this.hmacSha256(kService, 'aws4_request');
        const signature = await this.hmacSha256(kSigning, stringToSign);
        return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Préparation de la requête - IDENTIQUE au Python
    async prepareRequest(content, key) {
        const host = this.getHost();
        const url = this.buildUrl(key);
        const method = 'PUT';

        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const date = amzDate.slice(0, 8);

        // 1. Calculer le hash du payload (comme Python)
        const payloadHash = await this.sha256(content);

        // 2. Construction de l'URI canonique
        const canonicalUri = `/${this.config.bucket}/${key}`;
        const canonicalQueryString = '';

        // 3. Headers à signer (comme Python)
        const contentType = 'application/octet-stream';
        const headersToSign = {
            'host': host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'content-type': contentType
        };

        // Trier les headers (comme Python)
        const sortedHeaders = Object.entries(headersToSign).sort((a, b) => a[0].localeCompare(b[0]));
        const canonicalHeaders = sortedHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
        const signedHeaders = sortedHeaders.map(([k]) => k).join(';');

        // 4. Requête canonique (comme Python)
        const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

        this.logger.debug(`📝 Requête canonique:\n${canonicalRequest}`);

        // 5. Hash de la requête canonique (comme Python)
        const hashedCanonical = await this.sha256(canonicalRequest);

        // 6. String to sign (comme Python)
        const region = this.config.region;
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${date}/${region}/s3/aws4_request\n${hashedCanonical}`;

        this.logger.debug(`🔑 String to sign:\n${stringToSign}`);

        // 7. Signature (comme Python)
        const signature = await this.generateSignature(
            this.config.secretKey,
            date,
            region,
            stringToSign
        );

        // 8. Authorization (comme Python)
        const auth = `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}/${date}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        this.logger.debug(`🔐 Authorization: ${auth}`);

        // 9. Headers finaux (comme Python)
        const headers = {
            'Host': host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'Authorization': auth,
            'Content-Type': contentType,
            'Content-Length': content.length.toString()
        };

        return { url, headers, payloadHash };
    }

    // Upload
    async upload(content, key) {
        try {
            const req = await this.prepareRequest(content, key);

            this.logger.info(`📤 Upload: ${key} (${content.length} octets)`);
            this.logger.info(`🔗 URL: ${req.url}`);

            this.logger.debug('📋 Headers:');
            Object.entries(req.headers).forEach(([k, v]) => {
                if (k === 'Authorization') {
                    this.logger.debug(`  ${k}: ${v}`);
                } else {
                    this.logger.debug(`  ${k}: ${v}`);
                }
            });

            const response = await fetch(req.url, {
                method: 'PUT',
                headers: req.headers,
                body: content
            });

            let responseText = '';
            try {
                responseText = await response.text();
            } catch (e) {}

            this.logger.info(`📊 Status: ${response.status} ${response.statusText}`);

            if (responseText) {
                this.logger.debug(`📄 Réponse: ${responseText}`);
            }

            if (!response.ok) {
                throw new Error(`[${response.status}] ${responseText || response.statusText}`);
            }

            this.logger.success(`✅ Upload réussi !`);
            return { key, url: req.url, status: response.status };

        } catch (error) {
            this.logger.error(`❌ Échec: ${error.message}`);
            throw error;
        }
    }

    // Test
    async test() {
        this.logger.info('🧪 Test de connexion...');

        const content = new TextEncoder().encode(`Test MinIO - ${new Date().toISOString()}`);
        const key = `test-${Date.now()}.txt`;

        const result = await this.upload(content, key);

        this.logger.success('✅ Test réussi !');
        return result;
    }
}

// ==========================================
// EXPORT
// ==========================================

export async function testMinIO(config) {
    const client = new MinioClient(config);
    return await client.test();
}

export function createClient(config) {
    return new MinioClient(config);
}