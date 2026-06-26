/*
 * MinIO Client - Client S3 compatible avec support multipart
 * Version corrigée avec multipart upload fonctionnel
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
	/**
	 * @param {Object} config - Configuration du client
	 * @param {string} config.endpoint - Endpoint MinIO (ex: localhost:9000)
	 * @param {string} config.bucket - Nom du bucket
	 * @param {string} config.accessKeyId - Access Key
	 * @param {string} config.secretAccessKey - Secret Key
	 * @param {boolean} config.useSSL - Utiliser HTTPS (défaut: false)
	 * @param {string} config.region - Région (défaut: us-east-1)
	 * @param {number} config.multipartThreshold - Seuil multipart en octets (défaut: 5MB)
	 * @param {number} config.chunkSize - Taille des chunks en octets (défaut: 5MB)
	 * @param {number} config.concurrentUploads - Uploads concurrents (défaut: 3)
	 */
	constructor(config) {
		this.config = {
			endpoint: config.endpoint,
			bucket: config.bucket,
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			useSSL: config.useSSL ?? false,
			usePathStyle: config.usePathStyle ?? true,
			region: config.region || 'us-east-1',
			multipartThreshold: config.multipartThreshold || 5 * 1024 * 1024,
			chunkSize: config.chunkSize || 5 * 1024 * 1024,
			concurrentUploads: config.concurrentUploads || 3,
			publicEndpoint: config.publicEndpoint || config.endpoint
		};
	}

	// ==========================================
	// MÉTHODES DE BASE
	// ==========================================

	getHost() {
		return this.config.endpoint.replace(/^https?:\/\//, '');
	}

	buildUrl(key) {
		const protocol = this.config.useSSL ? 'https' : 'http';
		const host = this.getHost();
		const path = `/${this.config.bucket}/${key}`;
		return `${protocol}://${host}${path}`;
	}

	// ==========================================
	// CRYPTOGRAPHIE
	// ==========================================

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
			{ name: 'HMAC', hash: 'SHA-256' },
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

	// ==========================================
	// SIGNATURE DES REQUÊTES
	// ==========================================

	/**
	 * Signe une requête PUT standard (upload simple)
	 */
	async signRequest(method, path, headers, body = null) {
		const host = this.getHost();
		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);
		const region = this.config.region;

		let payloadHash;
		if (body && body.byteLength > 0) {
			payloadHash = await this.sha256(body);
		} else {
			payloadHash = 'UNSIGNED-PAYLOAD';
		}

		// Headers à signer
		const headersToSign = {
			'host': host,
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate
		};

		// Ajouter content-type si présent dans les headers
		if (headers && headers['Content-Type']) {
			headersToSign['content-type'] = headers['Content-Type'];
		}

		const sortedHeaders = Object.entries(headersToSign).sort((a, b) => a[0].localeCompare(b[0]));
		const canonicalHeaders = sortedHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
		const signedHeaders = sortedHeaders.map(([k]) => k).join(';');

		// Query string (si présente dans le path)
		const pathParts = path.split('?');
		const canonicalUri = pathParts[0];
		const canonicalQueryString = pathParts[1] || '';

		const canonicalRequest =
			`${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

		const hashedCanonical = await this.sha256String(canonicalRequest);
		const stringToSign =
			`AWS4-HMAC-SHA256\n${amzDate}\n${date}/${region}/s3/aws4_request\n${hashedCanonical}`;

		const signature = await this.generateSignature(
			this.config.secretAccessKey,
			date,
			region,
			stringToSign
		);

		const auth =
			`AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${date}/${region}/s3/aws4_request, ` +
			`SignedHeaders=${signedHeaders}, ` +
			`Signature=${signature}`;

		return {
			auth,
			amzDate,
			payloadHash,
			signedHeaders
		};
	}

	// ==========================================
	// PRÉPARATION DES REQUÊTES
	// ==========================================

	async prepareRequest(body, key) {
		const host = this.getHost();
		const method = 'PUT';
		const path = `/${this.config.bucket}/${key}`;
		const url = this.buildUrl(key);

		const headers = {
			'Host': host,
			'Content-Type': 'application/octet-stream'
		};

		const signature = await this.signRequest(method, path, headers, body);

		headers['x-amz-content-sha256'] = signature.payloadHash;
		headers['x-amz-date'] = signature.amzDate;
		headers['Authorization'] = signature.auth;

		return { url, headers };
	}

	/**
	 * Prépare une requête avec query string (pour multipart)
	 */
	async prepareRequestWithQuery(method, key, queryString, body = null, extraHeaders = {}) {
		const host = this.getHost();
		const path = `/${this.config.bucket}/${key}${queryString}`;
		const url = `${this.buildUrl(key)}${queryString}`;

		const headers = {
			'Host': host,
			...extraHeaders
		};

		// Si pas de Content-Type défini, mettre celui par défaut
		if (!headers['Content-Type']) {
			headers['Content-Type'] = 'application/octet-stream';
		}

		const signature = await this.signRequest(method, path, headers, body);

		headers['x-amz-content-sha256'] = signature.payloadHash;
		headers['x-amz-date'] = signature.amzDate;
		headers['Authorization'] = signature.auth;

		return { url, headers };
	}

	// ==========================================
	// UPLOAD (point d'entrée principal)
	// ==========================================

	async upload(content, key) {
		try {
			let body;
			if (content instanceof Uint8Array) {
				body = content;
			} else if (content instanceof ArrayBuffer) {
				body = new Uint8Array(content);
			} else {
				body = new Uint8Array(content);
			}

			const size = body.byteLength;
			const threshold = this.config.multipartThreshold;

			minioLog(`📤 Upload: ${key} (${size} octets)`);

			if (size <= threshold) {
				return await this._uploadSingle(body, key);
			}

			minioLog(`📤 Upload multipart (${size} octets, seuil: ${threshold})`);
			return await this._uploadMultipart(body, key);
		} catch (error) {
			minioLogError(`❌ Erreur d'upload: ${error.message}`);
			minioLogError(`📋 Stack: ${error.stack}`);
			throw error;
		}
	}

	// ==========================================
	// UPLOAD SIMPLE
	// ==========================================

	async _uploadSingle(body, key) {
		const req = await this.prepareRequest(body, key);
		const headers = { ...req.headers };
		delete headers['Content-Length'];

		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, 60000);

		try {
			const response = await fetch(req.url, {
				method: 'PUT',
				headers: headers,
				body: body,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			let responseText = '';
			try {
				responseText = await response.text();
			} catch (e) {}

			if (!response.ok) {
				let errorMsg = `[${response.status}] ${response.statusText}`;
				if (responseText) {
					const match = responseText.match(/<Message>(.*?)<\/Message>/);
					if (match) {
						errorMsg = `[${response.status}] ${match[1]}`;
					} else {
						errorMsg = `[${response.status}] ${responseText}`;
					}
				}
				throw new Error(errorMsg);
			}

			minioLog(`✅ Upload simple réussi: ${key}`);
			return { key, url: req.url, status: response.status };
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === 'AbortError') {
				throw new Error('Timeout: L\'upload a pris plus de 60 secondes');
			}
			throw error;
		}
	}

	// ==========================================
	// UPLOAD MULTIPART
	// ==========================================

	async _uploadMultipart(body, key) {
		const chunkSize = this.config.chunkSize;
		const totalSize = body.byteLength;
		const totalChunks = Math.ceil(totalSize / chunkSize);

		minioLog(`📦 Multipart: ${totalChunks} morceaux de ${chunkSize / 1024 / 1024}MB`);

		// 1. Initier l'upload multipart
		const uploadId = await this._initiateMultipartUpload(key);
		minioLog(`📦 Upload ID: ${uploadId}`);

		// 2. Uploader les morceaux
		const parts = [];
		const maxConcurrent = this.config.concurrentUploads;

		for (let i = 0; i < totalChunks; i += maxConcurrent) {
			const batch = [];
			const batchEnd = Math.min(i + maxConcurrent, totalChunks);

			for (let j = i; j < batchEnd; j++) {
				const start = j * chunkSize;
				const end = Math.min(start + chunkSize, totalSize);
				const chunk = body.slice(start, end);
				const partNumber = j + 1;
				batch.push(this._uploadPart(key, uploadId, partNumber, chunk));
			}

			const results = await Promise.all(batch);
			parts.push(...results);
			minioLog(`📦 Progression: ${Math.min(i + maxConcurrent, totalChunks)}/${totalChunks}`);
		}

		// 3. Finaliser l'upload
		minioLog(`📦 Finalisation de l'upload multipart...`);
		const result = await this._completeMultipartUpload(key, uploadId, parts);
		minioLog(`✅ Upload multipart réussi: ${key}`);

		return result;
	}

	/**
	 * Initie un upload multipart
	 * Règle: Content-Type n'est PAS signé pour l'initiation
	 */
	async _initiateMultipartUpload(key) {
		const method = 'POST';
		const queryString = '?uploads=';
		const path = `/${this.config.bucket}/${key}${queryString}`;

		// Pour l'initiation, on ne signe PAS le Content-Type
		const req = await this.prepareRequestWithQuery(method, key, queryString);

		const response = await fetch(req.url, {
			method: 'POST',
			headers: req.headers
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Initiation multipart échouée: ${response.status} - ${text}`);
		}

		const text = await response.text();
		const uploadId = text.match(/<UploadId>(.*?)<\/UploadId>/)?.[1];
		if (!uploadId) {
			throw new Error('UploadId non trouvé dans la réponse');
		}

		return uploadId;
	}

	/**
	 * Upload un morceau
	 * Règle: Content-Type est signé pour l'upload part
	 */
	async _uploadPart(key, uploadId, partNumber, chunk) {
		const method = 'PUT';
		const queryString = `?partNumber=${partNumber}&uploadId=${uploadId}`;

		// Pour l'upload part, on signe le Content-Type
		const req = await this.prepareRequestWithQuery(
			method,
			key,
			queryString,
			chunk,
			{ 'Content-Type': 'application/octet-stream' }
		);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, 60000);

		try {
			const response = await fetch(req.url, {
				method: 'PUT',
				headers: req.headers,
				body: chunk,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Part ${partNumber} échoué: ${response.status} - ${text}`);
			}

			const etag = response.headers.get('ETag');
			return { PartNumber: partNumber, ETag: etag };
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === 'AbortError') {
				throw new Error(`Timeout part ${partNumber}`);
			}
			throw error;
		}
	}

	/**
	 * Finalise un upload multipart
	 * Règle: Content-Type est signé pour la complétion
	 */
	async _completeMultipartUpload(key, uploadId, parts) {
		// Construire le XML
		let xml = '<CompleteMultipartUpload>';
		for (const part of parts) {
			xml += `<Part><PartNumber>${part.PartNumber}</PartNumber><ETag>${part.ETag}</ETag></Part>`;
		}
		xml += '</CompleteMultipartUpload>';

		const xmlBuffer = new TextEncoder().encode(xml);
		const method = 'POST';
		const queryString = `?uploadId=${uploadId}`;

		// Pour la complétion, on signe le Content-Type
		const req = await this.prepareRequestWithQuery(
			method,
			key,
			queryString,
			xmlBuffer,
			{ 'Content-Type': 'application/xml' }
		);

		const response = await fetch(req.url, {
			method: 'POST',
			headers: req.headers,
			body: xmlBuffer
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Complétion multipart échouée: ${response.status} - ${text}`);
		}

		return {
			key,
			url: this.buildUrl(key),
			status: response.status,
			uploadId: uploadId
		};
	}

	// ==========================================
	// TÉLÉCHARGEMENT
	// ==========================================

	/**
	 * Génère les headers authentifiés pour un téléchargement GET
	 */
	async _getDownloadHeaders(key) {
		const host = this.getHost();
		const method = 'GET';
		const path = `/${this.config.bucket}/${key}`;

		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);
		const region = this.config.region;
		const payloadHash = 'UNSIGNED-PAYLOAD';

		const headersToSign = {
			'host': host,
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate
		};

		const sortedHeaders = Object.entries(headersToSign).sort((a, b) => a[0].localeCompare(b[0]));
		const canonicalHeaders = sortedHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
		const signedHeaders = sortedHeaders.map(([k]) => k).join(';');

		const canonicalRequest =
			`${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

		const hashedCanonical = await this.sha256String(canonicalRequest);
		const stringToSign =
			`AWS4-HMAC-SHA256\n${amzDate}\n${date}/${region}/s3/aws4_request\n${hashedCanonical}`;

		const signature = await this.generateSignature(
			this.config.secretAccessKey,
			date,
			region,
			stringToSign
		);

		const auth =
			`AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${date}/${region}/s3/aws4_request, ` +
			`SignedHeaders=${signedHeaders}, ` +
			`Signature=${signature}`;

		return {
			'Host': host,
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate,
			'Authorization': auth
		};
	}

	// ==========================================
	// URL PRÉ-SIGNÉE
	// ==========================================

	/**
	 * Génère une URL pré-signée pour un objet
	 * @param {string} key - Clé de l'objet
	 * @param {number} expiresIn - Durée de validité en secondes (défaut: 7 jours)
	 * @returns {Promise<string>} URL pré-signée
	 */
	async generatePresignedUrl(key, expiresIn = 604800) {
		const host = this.getHost();
		const protocol = this.config.useSSL ? 'https' : 'http';
		const region = this.config.region || 'us-east-1';
		const bucket = this.config.bucket;

		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);

		const queryParams = {
			'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
			'X-Amz-Credential': `${this.config.accessKeyId}/${date}/${region}/s3/aws4_request`,
			'X-Amz-Date': amzDate,
			'X-Amz-Expires': expiresIn.toString(),
			'X-Amz-SignedHeaders': 'host'
		};

		const sortedKeys = Object.keys(queryParams).sort();
		const canonicalQueryString = sortedKeys
			.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
			.join('&');

		const canonicalRequest = `GET\n/${bucket}/${key}\n${canonicalQueryString}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;

		const hashedCanonical = await this.sha256String(canonicalRequest);
		const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${date}/${region}/s3/aws4_request\n${hashedCanonical}`;

		const signature = await this.generateSignature(
			this.config.secretAccessKey,
			date,
			region,
			stringToSign
		);

		const baseUrl = `${protocol}://${host}/${bucket}/${key}`;
		return `${baseUrl}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
	}

	/**
	 * Upload un fichier et retourne une URL pré-signée
	 */
	async uploadWithPresignedUrl(content, key, expiresIn = 604800) {
		const uploadResult = await this.upload(content, key);
		const presignedUrl = await this.generatePresignedUrl(key, expiresIn);
		return {
			key: key,
			url: uploadResult.url,
			presignedUrl: presignedUrl
		};
	}

	// ==========================================
	// TEST
	// ==========================================

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
export default MinioClient;