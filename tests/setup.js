/**
 * Setup Jest pour les tests MinIO
 * Configure l'environnement Node.js
 */

import nodeCrypto from 'crypto';

console.log('🔧 Configuration de l\'environnement de test...');

// ==========================================
// 1. TextEncoder / TextDecoder
// ==========================================

if (typeof global.TextEncoder === 'undefined') {
	global.TextEncoder = class TextEncoder {
		encode(str) {
			return Buffer.from(str, 'utf-8');
		}
	};
	global.TextDecoder = class TextDecoder {
		decode(buffer) {
			return Buffer.from(buffer).toString('utf-8');
		}
	};
	console.log('✅ TextEncoder/TextDecoder polyfill chargé');
}

// ==========================================
// 2. crypto.subtle
// ==========================================

if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
	// Utiliser webcrypto de Node.js
	if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
		global.crypto = nodeCrypto.webcrypto;
		console.log('✅ crypto.webcrypto chargé');
	} else {
		// Fallback: polyfill manuel
		console.warn('⚠️ crypto.subtle non disponible, utilisation d\'un polyfill de test');

		const subtle = {
			async digest(algorithm, data) {
				let buffer;
				if (data instanceof Uint8Array) {
					buffer = data;
				} else if (Buffer.isBuffer(data)) {
					buffer = data;
				} else {
					buffer = Buffer.from(data);
				}
				const hash = nodeCrypto.createHash('sha256');
				hash.update(buffer);
				return hash.digest();
			},

			async importKey(format, keyData, algorithm, extractable, usages) {
				if (algorithm.name === 'HMAC') {
					return keyData;
				}
				throw new Error(`importKey non supporté pour ${algorithm.name}`);
			},

			async sign(algorithm, key, data) {
				if (algorithm.name === 'HMAC') {
					let keyBuffer = key;
					if (typeof key === 'string') {
						keyBuffer = Buffer.from(key, 'utf-8');
					}
					const hmac = nodeCrypto.createHmac('sha256', keyBuffer);
					hmac.update(data);
					return hmac.digest();
				}
				throw new Error(`sign non supporté pour ${algorithm.name}`);
			}
		};

		global.crypto = { subtle };
		console.log('✅ Polyfill crypto.subtle chargé');
	}
}

// ==========================================
// 3. fetch (pour les tests HTTP)
// ==========================================

if (typeof global.fetch === 'undefined') {
	try {
		const nodeFetch = await import('node-fetch');
		global.fetch = nodeFetch.default;
		global.Headers = nodeFetch.Headers;
		global.Request = nodeFetch.Request;
		global.Response = nodeFetch.Response;
		console.log('✅ node-fetch chargé');
	} catch (e) {
		console.warn('⚠️ node-fetch non disponible');
	}
}

console.log('✅ Environnement de test prêt');
console.log(`   Crypto: ${global.crypto && global.crypto.subtle ? '✅' : '❌'}`);
console.log(`   Fetch: ${typeof global.fetch !== 'undefined' ? '✅' : '❌'}`);
console.log(`   TextEncoder: ${typeof global.TextEncoder !== 'undefined' ? '✅' : '❌'}`);