#!/usr/bin/env node

import { MinioClient } from './minio-core.js';

// ==========================================
// CONFIGURATION
// ==========================================

const CONFIG = {
    endpoint: process.env.MINIO_ENDPOINT || 'minio-api.cicd.exygen.fr:443',
    bucket: process.env.MINIO_BUCKET || 'attachments',
    accessKey: process.env.MINIO_ACCESS_KEY || 'root',
    secretKey: process.env.MINIO_SECRET_KEY || 'Password1!',
    useSSL: process.env.MINIO_USE_SSL !== 'false',
    usePathStyle: process.env.MINIO_USE_PATH_STYLE !== 'false',
    region: process.env.MINIO_REGION || 'us-east-1'
};

// ==========================================
// AFFICHAGE
// ==========================================

console.log('\n' + '═'.repeat(60));
console.log('🧪 TESTEUR MINIO - Node.js');
console.log('═'.repeat(60) + '\n');

console.log('📌 Configuration:');
console.log(`  Endpoint: ${CONFIG.endpoint}`);
console.log(`  Bucket:   ${CONFIG.bucket}`);
console.log(`  SSL:      ${CONFIG.useSSL}`);
console.log(`  Path:     ${CONFIG.usePathStyle}`);
console.log(`  Region:   ${CONFIG.region}`);
console.log('');

// ==========================================
// EXÉCUTION
// ==========================================

const client = new MinioClient(CONFIG);

// Gestion des arguments CLI
const args = process.argv.slice(2);

if (args.includes('--list')) {
    client.list()
        .then(xml => {
            console.log('\n📋 Liste des fichiers:');
            console.log(xml);
        })
        .catch(console.error);
} else if (args.includes('--delete') && args.length > 1) {
    const key = args[args.indexOf('--delete') + 1];
    client.delete(key)
        .then(() => console.log(`✅ Fichier supprimé: ${key}`))
        .catch(console.error);
} else {
    client.test()
        .then(result => {
            console.log('\n' + '═'.repeat(60));
            console.log('✅ SUCCÈS');
            console.log('═'.repeat(60));
            console.log(`📄 Fichier: ${result.key}`);
            console.log(`🔗 URL:    ${result.url}`);
        })
        .catch(error => {
            console.log('\n' + '═'.repeat(60));
            console.log('❌ ÉCHEC');
            console.log('═'.repeat(60));
            process.exit(1);
        });
}