/**
 * Tests du client MinIO pour Jest
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import MinioClient from '../src/minio/minio-client.js';

// ==========================================
// CONFIGURATION
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_CONFIG = {
	endpoint: process.env.MINIO_ENDPOINT || 'localhost:3084',
	bucket: process.env.MINIO_BUCKET || 'attachments',
	accessKeyId: process.env.MINIO_ACCESS_KEY || 'root',
	secretAccessKey: process.env.MINIO_SECRET_KEY || 'Password1!',
	useSSL: process.env.MINIO_USE_SSL === 'true' || false,
	region: process.env.MINIO_REGION || 'us-east-1',
	multipartThreshold: process.env.MINIO_MULTIPART_THRESHOLD ? parseInt(process.env.MINIO_MULTIPART_THRESHOLD) : 5 * 1024 * 1024,
	chunkSize: process.env.MINIO_CHUNK_SIZE ? parseInt(process.env.MINIO_CHUNK_SIZE) : 5 * 1024 * 1024,
	concurrentUploads: process.env.MINIO_CONCURRENT_UPLOADS ? parseInt(process.env.MINIO_CONCURRENT_UPLOADS) : 3
};

// ==========================================
// FIXTURES
// ==========================================

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
if (!fs.existsSync(FIXTURES_DIR)) {
	fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

const TEST_FILE_PATH = path.join(FIXTURES_DIR, 'test-file.txt');
if (!fs.existsSync(TEST_FILE_PATH)) {
	fs.writeFileSync(TEST_FILE_PATH, 'Test file content for MinIO upload');
}

// Générer un fichier de test de 1MB
const LARGE_FILE_PATH = path.join(FIXTURES_DIR, 'large-file.bin');
if (!fs.existsSync(LARGE_FILE_PATH)) {
	const buffer = Buffer.alloc(1 * 1024 * 1024, 'A');
	fs.writeFileSync(LARGE_FILE_PATH, buffer);
}

// ==========================================
// UTILITAIRES DE TEST
// ==========================================

function generateTestKey(prefix = 'test') {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

async function cleanupFiles(client, keys) {
	for (const key of keys) {
		try {
			await client._deleteObject(key);
			console.log(`   🧹 Nettoyé: ${key}`);
		} catch (e) {
			// Ignorer les erreurs de nettoyage
		}
	}
}

// ==========================================
// TESTS
// ==========================================

describe('MinIO Client', () => {
	let client;
	const uploadedKeys = [];

	beforeAll(() => {
		client = new MinioClient(TEST_CONFIG);
		console.log('🧪 Test MinIO Client');
		console.log(`   Endpoint: ${TEST_CONFIG.endpoint}`);
		console.log(`   Bucket: ${TEST_CONFIG.bucket}`);
		console.log(`   Multipart Threshold: ${(TEST_CONFIG.multipartThreshold / 1024 / 1024).toFixed(1)}MB`);
		console.log(`   Chunk Size: ${(TEST_CONFIG.chunkSize / 1024 / 1024).toFixed(1)}MB`);
		console.log(`   Concurrent Uploads: ${TEST_CONFIG.concurrentUploads}`);
		console.log(`   Crypto: ${global.crypto && global.crypto.subtle ? '✅' : '❌'}`);
		console.log(`   Fetch: ${typeof global.fetch !== 'undefined' ? '✅' : '❌'}`);
	});

	afterAll(async () => {
		await cleanupFiles(client, uploadedKeys);
	});

	// ==========================================
	// TESTS D'UPLOAD
	// ==========================================

	describe('Upload', () => {
		test('1. Upload simple (petit fichier)', async () => {
			const key = generateTestKey('small');
			const content = Buffer.from('Hello MinIO - ' + Date.now());

			const result = await client.upload(content, key);
			uploadedKeys.push(key);

			expect(result).toBeDefined();
			expect(result.key).toBe(key);
			expect(result.url).toBeDefined();
			expect(result.status).toBe(200);
			console.log(`   ✅ Upload simple réussi: ${key} (${content.length} octets)`);
		});

		test('2. Upload avec URL pré-signée', async () => {
			const key = generateTestKey('presigned');
			const content = Buffer.from('Presigned upload test - ' + Date.now());
			const expiresIn = 120;

			const result = await client.uploadWithPresignedUrl(content, key, expiresIn);
			uploadedKeys.push(key);

			expect(result).toBeDefined();
			expect(result.key).toBe(key);
			expect(result.url).toBeDefined();
			expect(result.presignedUrl).toBeDefined();
			expect(result.presignedUrl).toContain('X-Amz-');

			// Vérifier que l'URL pré-signée fonctionne
			const response = await fetch(result.presignedUrl);
			expect(response.ok).toBe(true);

			console.log(`   ✅ Upload avec URL pré-signée réussi: ${key}`);
		});

		test('3. Upload d\'un fichier réel', async () => {
			const fileContent = fs.readFileSync(TEST_FILE_PATH);
			const filename = path.basename(TEST_FILE_PATH);
			const key = generateTestKey('real');

			const result = await client.upload(fileContent, key);
			uploadedKeys.push(key);

			expect(result).toBeDefined();
			expect(result.key).toBe(key);
			expect(result.status).toBe(200);
			console.log(`   ✅ Upload fichier réel réussi: ${filename} (${fileContent.length} octets)`);
		});

		test('4. Upload d\'un fichier de 1MB', async () => {
			const fileContent = fs.readFileSync(LARGE_FILE_PATH);
			const key = generateTestKey('1mb');

			const start = Date.now();
			const result = await client.upload(fileContent, key);
			const duration = Date.now() - start;
			uploadedKeys.push(key);

			expect(result).toBeDefined();
			expect(result.key).toBe(key);
			expect(result.status).toBe(200);
			console.log(`   ✅ Upload 1MB réussi: ${(fileContent.length/1024/1024).toFixed(2)}MB en ${duration}ms`);
		});

		test('5. Upload de gros fichier (multipart)', async () => {
			const size = 6 * 1024 * 1024; // 6MB - déclenche le multipart (seuil: 5MB)
			const content = Buffer.alloc(size, 'B');
			const key = generateTestKey('multipart');

			const start = Date.now();
			const result = await client.upload(content, key);
			const duration = Date.now() - start;
			uploadedKeys.push(key);

			expect(result).toBeDefined();
			expect(result.key).toBe(key);
			expect(result.status).toBe(200);
			console.log(`   ✅ Upload multipart réussi: ${(size/1024/1024).toFixed(1)}MB en ${duration}ms`);
		});

		test('6. Upload de très gros fichier (multipart avec plusieurs chunks)', async () => {
			const size = 12 * 1024 * 1024; // 12MB - multiple chunks
			const content = Buffer.alloc(size, 'C');
			const key = generateTestKey('large-multipart');

			const start = Date.now();
			const result = await client.upload(content, key);
			const duration = Date.now() - start;
			uploadedKeys.push(key);

			expect(result).toBeDefined();
			expect(result.key).toBe(key);
			expect(result.status).toBe(200);
			console.log(`   ✅ Upload très gros fichier réussi: ${(size/1024/1024).toFixed(1)}MB en ${duration}ms`);
		});
	});

	// ==========================================
	// TESTS DE TÉLÉCHARGEMENT
	// ==========================================

	describe('Download', () => {
		let downloadTestKey;
		const downloadContent = Buffer.from('Download test content - ' + Date.now());

		beforeAll(async () => {
			downloadTestKey = generateTestKey('download');
			await client.upload(downloadContent, downloadTestKey);
			uploadedKeys.push(downloadTestKey);
			console.log(`   📤 Fichier de test créé: ${downloadTestKey}`);
		});

		test('7. Téléchargement authentifié (avec signature S3)', async () => {
			const url = client.buildUrl(downloadTestKey);
			const headers = await client._getDownloadHeaders(downloadTestKey);

			const response = await fetch(url, {
				method: 'GET',
				headers: headers
			});

			expect(response.ok).toBe(true);
			const buffer = await response.arrayBuffer();
			const content = Buffer.from(buffer);
			expect(content.toString()).toBe(downloadContent.toString());
			console.log(`   ✅ Téléchargement authentifié réussi: ${content.length} octets`);
		});

		test('8. Téléchargement via URL pré-signée', async () => {
			const presignedUrl = await client.generatePresignedUrl(downloadTestKey, 60);

			const response = await fetch(presignedUrl);
			expect(response.ok).toBe(true);
			const buffer = await response.arrayBuffer();
			const content = Buffer.from(buffer);
			expect(content.toString()).toBe(downloadContent.toString());
			console.log(`   ✅ Téléchargement via URL pré-signée réussi: ${content.length} octets`);
		});

		test('9. Téléchargement avec URL pré-signée expirée (doit échouer)', async () => {
			// Générer une URL avec une expiration très courte
			const presignedUrl = await client.generatePresignedUrl(downloadTestKey, 1);

			// Attendre 2 secondes pour que l'URL expire
			await new Promise(resolve => setTimeout(resolve, 2000));

			const response = await fetch(presignedUrl);
			expect(response.ok).toBe(false);
			expect(response.status).toBe(403);
			console.log(`   ✅ URL pré-signée expirée correctement rejetée (${response.status})`);
		});
	});

	// ==========================================
	// TESTS D'URL PRÉ-SIGNÉE
	// ==========================================

	describe('Presigned URLs', () => {
		let urlTestKey;
		const urlContent = Buffer.from('URL test content - ' + Date.now());

		beforeAll(async () => {
			urlTestKey = generateTestKey('url');
			await client.upload(urlContent, urlTestKey);
			uploadedKeys.push(urlTestKey);
			console.log(`   📤 Fichier de test créé: ${urlTestKey}`);
		});

		test('10. Génération URL pré-signée GET', async () => {
			const presignedUrl = await client.generatePresignedUrl(urlTestKey, 120);

			expect(presignedUrl).toBeDefined();
			expect(presignedUrl).toContain(urlTestKey);
			expect(presignedUrl).toContain('X-Amz-Algorithm');
			expect(presignedUrl).toContain('X-Amz-Credential');
			expect(presignedUrl).toContain('X-Amz-Date');
			expect(presignedUrl).toContain('X-Amz-Expires');
			expect(presignedUrl).toContain('X-Amz-Signature');

			// Vérifier que l'URL fonctionne
			const response = await fetch(presignedUrl);
			expect(response.ok).toBe(true);

			console.log(`   ✅ URL pré-signée GET générée et fonctionnelle`);
		});

		test('11. Génération URL pré-signée avec durée personnalisée', async () => {
			const expiresIn = 3600; // 1 heure
			const presignedUrl = await client.generatePresignedUrl(urlTestKey, expiresIn);

			expect(presignedUrl).toContain(`X-Amz-Expires=${expiresIn}`);
			console.log(`   ✅ URL pré-signée avec durée ${expiresIn}s générée`);
		});

		test('12. Téléchargement via URL pré-signée avec vérification du contenu', async () => {
			const presignedUrl = await client.generatePresignedUrl(urlTestKey, 120);

			const response = await fetch(presignedUrl);
			expect(response.ok).toBe(true);

			const buffer = await response.arrayBuffer();
			const content = Buffer.from(buffer);
			expect(content.toString()).toBe(urlContent.toString());

			console.log(`   ✅ Contenu téléchargé via URL pré-signée: ${content.length} octets`);
		});
	});

	// ==========================================
	// TESTS DE PERFORMANCE
	// ==========================================

	describe('Performance', () => {
		test('13. Upload parallèle (2 fichiers simultanés)', async () => {
			const keys = [];
			const contents = [
				Buffer.from('Parallel test 1 - ' + Date.now()),
				Buffer.from('Parallel test 2 - ' + Date.now())
			];

			const start = Date.now();
			const promises = contents.map((content, i) => {
				const key = generateTestKey(`parallel-${i}`);
				keys.push(key);
				return client.upload(content, key);
			});

			const results = await Promise.all(promises);
			const duration = Date.now() - start;

			// Ajouter les clés pour nettoyage
			uploadedKeys.push(...keys);

			expect(results).toHaveLength(2);
			results.forEach(result => {
				expect(result.status).toBe(200);
			});

			console.log(`   ✅ Upload parallèle réussi: 2 fichiers en ${duration}ms`);
		});

		test('14. Upload avec progression (simulé)', async () => {
			const key = generateTestKey('progress');
			const size = 3 * 1024 * 1024; // 3MB
			const content = Buffer.alloc(size, 'D');

			const start = Date.now();
			const result = await client.upload(content, key);
			const duration = Date.now() - start;
			uploadedKeys.push(key);

			expect(result).toBeDefined();
			expect(result.status).toBe(200);
			console.log(`   ✅ Upload 3MB réussi: ${(size/1024/1024).toFixed(1)}MB en ${duration}ms`);
		});
	});
});

// ==========================================
// EXPORT POUR NPM TEST
// ==========================================

// Ce fichier peut être exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
	console.log('🧪 Exécution des tests Jest...');
}