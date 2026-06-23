/*
 * Wrapper Navigateur pour MinIO Client
 * Utilise le code core et expose les fonctions
 */

import { MinioClient, testMinIO, createClient } from './minio-core.js';

// Configuration par défaut (à modifier dans la console)
const DEFAULT_CONFIG = {
    endpoint: 'minio.cicd.exygen.fr:444',
    bucket: 'attachments',
    accessKey: 'root',
    secretKey: 'Password1!',
    useSSL: true,
    usePathStyle: true,
    region: 'us-east-1'
};

// ==========================================
// FONCTIONS EXPOSÉES DANS LE NAVIGATEUR
// ==========================================

// Fonction de test principale
window.testMinIO = async function(config = DEFAULT_CONFIG) {
    console.log('🧪 Test MinIO...');
    console.log('📌 Configuration:', config);

    const client = new MinioClient(config);
    return await client.test();
};

// Tester avec HTTP
window.testHTTP = async function() {
    const config = { ...DEFAULT_CONFIG, useSSL: false };
    return await window.testMinIO(config);
};

// Tester avec un endpoint personnalisé
window.testEndpoint = async function(endpoint) {
    const config = { ...DEFAULT_CONFIG, endpoint };
    return await window.testMinIO(config);
};

// Tester la connexion simple
window.testHead = async function() {
    const protocol = DEFAULT_CONFIG.useSSL ? 'https' : 'http';
    const url = `${protocol}://${DEFAULT_CONFIG.endpoint}/${DEFAULT_CONFIG.bucket}/`;

    console.log(`🔍 HEAD ${url}`);

    try {
        const response = await fetch(url, { method: 'HEAD' });
        console.log(`✅ Status: ${response.status}`);
        return response;
    } catch (error) {
        console.error(`❌ ${error.message}`);
        throw error;
    }
};

// Lister les fichiers
window.listFiles = async function() {
    const client = new MinioClient(DEFAULT_CONFIG);
    return await client.list();
};

// Supprimer un fichier
window.deleteFile = async function(key) {
    const client = new MinioClient(DEFAULT_CONFIG);
    return await client.delete(key);
};

// Upload manuel
window.uploadFile = async function(file, key) {
    const client = new MinioClient(DEFAULT_CONFIG);
    const content = await file.arrayBuffer();
    const buffer = new Uint8Array(content);
    return await client.upload(buffer, key || file.name);
};

// Créer un client personnalisé
window.createMinioClient = function(config) {
    return createClient({ ...DEFAULT_CONFIG, ...config });
};

// ==========================================
// AUTO-EXÉCUTION
// ==========================================

console.log('🚀 MinIO Tester chargé dans le navigateur');
console.log('═'.repeat(60));
console.log('📌 Configuration par défaut:', DEFAULT_CONFIG);
console.log('');
console.log('📋 Commandes disponibles:');
console.log('  testMinIO()           - Tester avec la config par défaut');
console.log('  testHTTP()            - Tester en HTTP');
console.log('  testEndpoint("...")   - Tester un autre endpoint');
console.log('  testHead()            - Tester la connexion simple');
console.log('  listFiles()           - Lister les fichiers du bucket');
console.log('  deleteFile("key")     - Supprimer un fichier');
console.log('  uploadFile(file, key) - Uploader un fichier');
console.log('  createMinioClient()   - Créer un client personnalisé');
console.log('');

// Auto-test si demandé
if (window.location.search.includes('autotest')) {
    console.log('🔬 Auto-test en cours...');
    window.testMinIO()
        .then(() => console.log('✅ Auto-test réussi'))
        .catch(() => console.log('❌ Auto-test échoué'));
}