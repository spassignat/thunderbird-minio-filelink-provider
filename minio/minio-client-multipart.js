/*
 * MinIO Client - Client S3 compatible avec support multipart
 * Version avec modifications minimales pour ajouter le multipart upload
 */

// ==========================================
// LOGGER
// ==========================================

const minioLog = (...args) => console.log('[MinIO Client]', ...args);
const minioLogError = (...args) => console.error('[MinIO Client]', ...args);

// ==========================================
// CLIENT MINIO
// ==========================================


class MultipartMinioClient {
	/**
	 * @param {MinioClientConfig} config
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
			multipartThreshold: config.multipartThreshold || 5 * 1024 * 1024, // 5MB
			chunkSize: config.chunkSize || 5 * 1024 * 1024, // 5MB par chunk
			concurrentUploads: config.concurrentUploads || 3,
			publicEndpoint: config.publicEndpoint || config.endpoint
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

	// ==========================================
	// MÉTHODES EXISTANTES (non modifiées)
	// ==========================================

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

		return {url, headers: finalHeaders, payloadHash};
	}

	// ==========================================
	// UPLOAD MODIFIÉ - avec support multipart
	// ==========================================

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

			minioLog(`📤 Upload: ${key} (${body.byteLength} octets)`);
			minioLog(`🌐 URL: ${req.url}`);

			const size = body.byteLength;
			const threshold = this.config.multipartThreshold;

			// Si le fichier est petit, utiliser l'upload simple existant
			if (size <= threshold) {
				minioLog(`📤 Upload simple (${size} octets)`);
				return await this._uploadSingle(body, key);
			}

			// Sinon, utiliser multipart
			minioLog(`📤 Upload multipart (${size} octets, seuil: ${threshold})`);
			return await this._uploadMultipart(body, key);

		} catch (error) {
			minioLogError(`❌ Erreur d'upload: ${error.message}`);
			minioLogError(`📋 Stack: ${error.stack}`);
			throw error;
		}
	}

	// ==========================================
	// UPLOAD SIMPLE (méthode existante légèrement modifiée)
	// ==========================================

	async _uploadSingle(body, key) {
		const req = await this.prepareRequest(body, key);

		minioLog(`📤 Upload simple: ${key} (${body.byteLength} octets)`);
		minioLog(`🌐 URL: ${req.url}`);

		// NE PAS inclure Content-Length manuellement - laissez fetch le gérer
		const headers = {...req.headers};
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

			minioLog(`✅ Upload simple réussi: ${key}`);
			return {key, url: req.url, status: response.status};

		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === 'AbortError') {
				throw new Error('Timeout: L\'upload a pris plus de 60 secondes');
			}
			throw error;
		}
	}

	// ==========================================
	// UPLOAD MULTIPART (NOUVEAU)
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

			// Attendre le lot
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
	 */
	async _initiateMultipartUpload(key) {
		const url = `${this.buildUrl(key)}?uploads=`;
		const headers = await this._getMultipartHeaders('POST', `/${this.config.bucket}/${key}?uploads=`, '');

		const response = await fetch(url, {
			method: 'POST', headers: headers
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
	 */
	async _uploadPart(key, uploadId, partNumber, chunk) {
		const url = `${this.buildUrl(key)}?partNumber=${partNumber}&uploadId=${uploadId}`;
		const headers = await this._getMultipartHeaders('PUT', `/${this.config.bucket}/${key}?partNumber=${partNumber}&uploadId=${uploadId}`, chunk);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			minioLogError(`⏰ Timeout part ${partNumber}`);
			controller.abort();
		}, 60000);

		try {
			const response = await fetch(url, {
				method: 'PUT', headers: headers, body: chunk, signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Part ${partNumber} échoué: ${response.status} - ${text}`);
			}

			const etag = response.headers.get('ETag');
			return {PartNumber: partNumber, ETag: etag};

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
	 */
	async _completeMultipartUpload(key, uploadId, parts) {
		const url = `${this.buildUrl(key)}?uploadId=${uploadId}`;

		// Construire le XML
		let xml = '<CompleteMultipartUpload>';
		for (const part of parts) {
			xml += `<Part><PartNumber>${part.PartNumber}</PartNumber><ETag>${part.ETag}</ETag></Part>`;
		}
		xml += '</CompleteMultipartUpload>';

		const headers = await this._getMultipartHeaders('POST', `/${this.config.bucket}/${key}?uploadId=${uploadId}`, xml);
		headers['Content-Type'] = 'application/xml';

		const response = await fetch(url, {
			method: 'POST', headers: headers, body: xml
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Complétion multipart échouée: ${response.status} - ${text}`);
		}

		return {
			key, url: this.buildUrl(key), status: response.status, uploadId: uploadId
		};
	}

	/**
	 * Génère les headers pour une requête multipart
	 */
	async _getMultipartHeaders(method, path, body) {
		const host = this.getHost();
		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);

		let payloadHash;
		if (body && body.byteLength > 0) {
			payloadHash = await this.sha256(body);
		} else {
			payloadHash = 'UNSIGNED-PAYLOAD';
		}

		const headersToSign = {
			'host': host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate
		};

		const sortedHeaders = Object.entries(headersToSign).sort((a, b) => a[0].localeCompare(b[0]));
		const canonicalHeaders = sortedHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
		const signedHeaders = sortedHeaders.map(([k]) => k).join(';');

		const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

		const hashedCanonical = await this.sha256String(canonicalRequest);

		const region = this.config.region;
		const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${date}/${region}/s3/aws4_request\n${hashedCanonical}`;

		const signature = await this.generateSignature(this.config.secretAccessKey, date, region, stringToSign);

		const auth = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${date}/${region}/s3/aws4_request, ` + `SignedHeaders=${signedHeaders}, ` + `Signature=${signature}`;

		const headers = {
			'Host': host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'Authorization': auth
		};

		// Ajouter Content-Type si nécessaire
		if (method === 'PUT' || method === 'POST') {
			headers['Content-Type'] = 'application/octet-stream';
		}

		return headers;
	}

	// ==========================================
	// MÉTHODES EXISTANTES (non modifiées)
	// ==========================================

	async test() {
		minioLog('🧪 Test de connexion...');
		const encoder = new TextEncoder();
		const content = encoder.encode(`Test MinIO - ${new Date().toISOString()}`);
		const key = `test-${Date.now()}.txt`;
		return await this.upload(content, key);
	}

	/**
	 * Génère une URL pré-signée pour un objet
	 * @param {string} key - Clé de l'objet
	 * @param {number} expiresIn - Durée de validité en secondes (défaut: 7 jours)
	 * @returns {Promise<string>} URL pré-signée
	 */
	async generatePresignedUrl(key, expiresIn = 604800) {
		// Utiliser l'endpoint configuré (peut déjà inclure le reverse proxy)
		const host = this.getHost();
		const protocol = this.config.useSSL ? 'https' : 'http';
		const region = this.config.region || 'us-east-1';
		const bucket = this.config.bucket;

		// Date et heure actuelles
		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
		const date = amzDate.slice(0, 8);

		// Construire la query string avec les paramètres S3
		const queryParams = {
			'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
			'X-Amz-Credential': `${this.config.accessKeyId}/${date}/${region}/s3/aws4_request`,
			'X-Amz-Date': amzDate,
			'X-Amz-Expires': expiresIn.toString(),
			'X-Amz-SignedHeaders': 'host'
		};

		// Trier les paramètres par ordre alphabétique (exigé par SigV4)
		const sortedKeys = Object.keys(queryParams).sort();
		const canonicalQueryString = sortedKeys
			.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
			.join('&');

		// Construire la requête canonique
		const canonicalRequest = `GET\n/${bucket}/${key}\n${canonicalQueryString}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;

		// Hash de la requête canonique
		const hashedCanonical = await this.sha256String(canonicalRequest);

		// Créer le "String to Sign"
		const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${date}/${region}/s3/aws4_request\n${hashedCanonical}`;

		// Générer la signature
		const signature = await this.generateSignature(
			this.config.secretAccessKey,
			date,
			region,
			stringToSign
		);

		// Construire l'URL finale
		const baseUrl = `${protocol}://${host}/${bucket}/${key}`;
		const presignedUrl = `${baseUrl}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

		minioLog(`🔗 URL pré-signée générée: ${presignedUrl.substring(0, 150)}...`);
		minioLog(`⏱️ Valable ${expiresIn} secondes (${Math.round(expiresIn / 86400)} jours)`);

		return presignedUrl;
	}

	/**
	 * Upload un fichier et retourne une URL pré-signée
	 * @param {Uint8Array} content - Contenu du fichier
	 * @param {string} key - Clé de l'objet
	 * @param {number} expiresIn - Durée de validité en secondes
	 * @returns {Promise<{key: string, url: string, presignedUrl: string}>}
	 */
	async uploadWithPresignedUrl(content, key, expiresIn = 604800) {
		// 1. Upload du fichier
		const uploadResult = await this.upload(content, key);

		// 2. Générer l'URL pré-signée
		const presignedUrl = await this.generatePresignedUrl(key, expiresIn);

		return {
			key: key, url: uploadResult.url,           // URL directe (pour info)
			presignedUrl: presignedUrl       // URL temporaire à partager
		};
	}
}

// ==========================================
// EXPORT
// ==========================================

// Pour utilisation dans les scripts Thunderbird
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {MinioClient};
}