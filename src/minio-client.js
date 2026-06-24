/*
 * MinIO Client - Client S3 compatible
 * Version indépendante pour utilisation dans Thunderbird
 */

// ==========================================
// LOGGER
// ==========================================

const minioLog = (...args) => console.log('[MinIO Client]', ...args);
const minioLogError = (...args) => console.error('[MinIO Client]', ...args);

// ==========================================
// CLIENT MINIO
// ==========================================

class MinioClient {
    constructor(config) {
        this.config = {
            endpoint: config.endpoint,
            bucket: config.bucket,
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
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

    async generateSignature(secretAccessKey, date, region, stringToSign) {
        const encoder = new TextEncoder();

        const kDate = await this.hmacSha256(encoder.encode('AWS4' + secretAccessKey), date);
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

        // 1. Hash du payload - VÉRIFIER QUE content EST BIEN UN Uint8Array
        const payloadHash = await this.sha256(content);
        minioLog(`🔑 Payload hash: ${payloadHash}`);

        // 2. URI canonique
        const canonicalUri = `/${this.config.bucket}/${key}`;
        const canonicalQueryString = '';

        // 3. Headers a signer
        const contentType = 'application/octet-stream';
        const headersToSign = {
            'host': host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'content-type': contentType
        };

        // Tri alphabétique
        const sortedHeaders = Object.entries(headersToSign).sort((a, b) => a[0].localeCompare(b[0]));
        const canonicalHeaders = sortedHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
        const signedHeaders = sortedHeaders.map(([k]) => k).join(';');

        // 4. Requête canonique
        const canonicalRequest =
            `${method}\n` +
            `${canonicalUri}\n` +
            `${canonicalQueryString}\n` +
            `${canonicalHeaders}\n` +
            `${signedHeaders}\n` +
            `${payloadHash}`;

        minioLog('📝 Requête canonique:');
        minioLog(canonicalRequest);

        // 5. Hash de la requête canonique
        const hashedCanonical = await this.sha256String(canonicalRequest);
        minioLog(`🔑 Hashed canonical: ${hashedCanonical}`);

        // 6. String to sign
        const region = this.config.region;
        const stringToSign =
            `AWS4-HMAC-SHA256\n` +
            `${amzDate}\n` +
            `${date}/${region}/s3/aws4_request\n` +
            `${hashedCanonical}`;

        minioLog('🔑 String to sign:');
        minioLog(stringToSign);

        // 7. Signature
        const signature = await this.generateSignature(
            this.config.secretAccessKey,
            date,
            region,
            stringToSign
        );

        // 8. Authorization
        const auth =
            `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${date}/${region}/s3/aws4_request, ` +
            `SignedHeaders=${signedHeaders}, ` +
            `Signature=${signature}`;

        minioLog('🔐 Authorization:');
        minioLog(auth);

        // 9. Headers finaux - NE PAS INCLURE Content-Length
        const finalHeaders = {
            'Host': host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'Authorization': auth,
            'Content-Type': contentType
            // 'Content-Length' est supprimé - fetch le gère automatiquement
        };

        minioLog('📋 Headers finaux:');
        Object.entries(finalHeaders).forEach(([k, v]) => {
            if (k === 'Authorization') {
                minioLog(`  ${k}: ${v.substring(0, 120)}...`);
            } else {
                minioLog(`  ${k}: ${v}`);
            }
        });

        return { url, headers: finalHeaders, payloadHash };
    }

    async upload(content, key) {
        try {
            // S'assurer que content est un Uint8Array ou ArrayBuffer
            let body;
            if (content instanceof Uint8Array) {
                body = content;
            } else if (content instanceof ArrayBuffer) {
                body = new Uint8Array(content);
            } else {
                body = new Uint8Array(content);
            }

            const req = await this.prepareRequest(body, key);

            minioLog(`📤 Upload: ${key} (${body.byteLength} octets)`);
            minioLog(`🌐 URL: ${req.url}`);

            // NE PAS inclure Content-Length manuellement - laissez fetch le gérer
            const headers = { ...req.headers };
            delete headers['Content-Length']; // Supprimer Content-Length

            // Ajouter un timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                minioLogError(`⏰ Timeout après 60 secondes`);
                controller.abort();
            }, 60000); // 60 secondes de timeout

            try {
                const response = await fetch(req.url, {
                    method: 'PUT',
                    headers: headers,
                    body: body,  // Uint8Array
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                let responseText = '';
                try {
                    responseText = await response.text();
                } catch (e) {
                    // Ignorer les erreurs de lecture du texte
                }

                minioLog(`📊 Status: ${response.status} ${response.statusText}`);

                if (responseText) {
                    minioLog('📄 Réponse:', responseText);
                }

                if (!response.ok) {
                    // MinIO renvoie souvent des erreurs XML
                    let errorMsg = `[${response.status}] ${response.statusText}`;
                    if (responseText) {
                        // Essayer d'extraire le message d'erreur XML
                        const match = responseText.match(/<Message>(.*?)<\/Message>/);
                        if (match) {
                            errorMsg = `[${response.status}] ${match[1]}`;
                        } else {
                            errorMsg = `[${response.status}] ${responseText}`;
                        }
                    }
                    throw new Error(errorMsg);
                }

                minioLog(`✅ Upload réussi: ${key}`);
                return { key, url: req.url, status: response.status };

            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    throw new Error('Timeout: L\'upload a pris plus de 60 secondes');
                }
                throw error;
            }

        } catch (error) {
            minioLogError(`❌ Erreur d'upload: ${error.message}`);
            minioLogError(`📋 Stack: ${error.stack}`);
            throw error;
        }
    }

    async test() {
        minioLog('🧪 Test de connexion...');
        const encoder = new TextEncoder();
        const content = encoder.encode(`Test MinIO - ${new Date().toISOString()}`);
        const key = `test-${Date.now()}.txt`;
        return await this.upload(content, key);
    }
}

// ==========================================
// EXPORT
// ==========================================

// Pour utilisation dans les scripts Thunderbird
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MinioClient };
}