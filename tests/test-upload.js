#!/usr/bin/env node

/*
 * Test MinIO Upload - Script simple
 * Uploade un fichier vers MinIO
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MinioClient from '../src/minio/minio-client.js';

// ==========================================
// CONFIGURATION
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
	endpoint: process.env.MINIO_ENDPOINT || 'localhost:9000',
	bucket: process.env.MINIO_BUCKET || 'test',
	accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
	secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
	useSSL: process.env.MINIO_USE_SSL === 'true' || false,
	region: process.env.MINIO_REGION || 'us-east-1'
};

// ==========================================
// MAIN
// ==========================================

async function main() {
	const filePath = process.argv[2];
	if (!filePath) {
		console.log(`
📤 Usage: npm run test:upload -- <fichier>

Variables d'environnement:
  MINIO_ENDPOINT     - Endpoint (défaut: localhost:9000)
  MINIO_BUCKET       - Bucket (défaut: test)
  MINIO_ACCESS_KEY   - Access Key (défaut: minioadmin)
  MINIO_SECRET_KEY   - Secret Key (défaut: minioadmin)
  MINIO_USE_SSL      - SSL (défaut: false)
  MINIO_REGION       - Région (défaut: us-east-1)

Exemple:
  npm run test:upload -- photo.jpg
  MINIO_BUCKET=my-bucket npm run test:upload -- doc.pdf
`);
		process.exit(1);
	}

	if (!fs.existsSync(filePath)) {
		console.error(`❌ Fichier non trouvé: ${filePath}`);
		process.exit(1);
	}

	const content = fs.readFileSync(filePath);
	const filename = path.basename(filePath);
	const key = `${Date.now()}-${filename}`;

	console.log('🚀 Test upload MinIO');
	console.log(`📁 Fichier: ${filePath} (${content.length} octets)`);
	console.log(`📦 Bucket: ${config.bucket}`);
	console.log(`🔑 Clé: ${key}`);
	console.log('');

	try {
		const client = new MinioClient(config);

		console.log('⏳ Upload en cours...');
		const start = Date.now();
		const result = await client.upload(content, key);
		const duration = Date.now() - start;

		console.log(`✅ Upload réussi en ${duration}ms`);
		console.log(`   URL: ${result.url}`);
		console.log(`   Status: ${result.status}`);

		// Générer URL pré-signée
		console.log('\n⏳ Génération URL pré-signée...');
		const presignedUrl = await client.generatePresignedUrl(key, 3600);
		console.log(`✅ URL pré-signée (valable 1h):`);
		console.log(`   ${presignedUrl}`);

	} catch (error) {
		console.error('❌ Erreur:', error.message);
		process.exit(1);
	}
}

main();