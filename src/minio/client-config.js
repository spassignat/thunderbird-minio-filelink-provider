class MinioClientConfig {
	/**
	 * @param {MinioClientConfig} config
	 */
	constructor(config) {
		this.endpoint = config.endpoint;
		this.bucket = config.bucket;
		this.accessKeyId = config.accessKeyId;
		this.secretAccessKey = config.secretAccessKey;
		this.useSSL = config.useSSL ?? false;
		this.usePathStyle = config.usePathStyle ?? true;
		this.region = config.region || 'us-east-1';
		this.multipartThreshold = config.multipartThreshold || 5 * 1024 * 1024; // 5M;
		this.chunkSize = config.chunkSize || 5 * 1024 * 1024; // 5MB par chun;
		this.concurrentUploads = config.concurrentUploads || 3;
		this.publicEndpoint = config.publicEndpoint || config.endpoinT;
	}
}

// ==========================================
// EXPORT
// ==========================================
//export default MinioClientConfig;
