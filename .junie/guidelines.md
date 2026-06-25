# Guidelines for Thunderbird MinIO Filelink Extension

## Project Context
This project is a Thunderbird extension enabling file uploads to a MinIO server for Filelink/CLoudFile attachments.

### CloudFile Plugin specification
The plugin specification on thunderbird is defined here: https://webextension-api.thunderbird.net/en/mv3/cloudFile.html


## Architecture
- **Manifest**: `src/manifest.json` defines the extension and permissions.
  - background/scripts: list js files required for the plugin execution
    - all sources from minio/, worker/
  - options_ui/page: entry point of plugin configuration
    - management.html
- **Configuration**:
    - `src/management.html` & `src/management.js`: User-facing configuration page.
      - Tous les champs de configuration définis dans MinioClientConfig sont représentés
    - `src/account-manager.js`: controlleur de l'écran management.html
        - Stock la configuration des comptes minio dans le stockage: browser.storage.local
        - communique avec background.js par browser.runtime.sendMessage
        - la configuration d'un compte est définie dans client-config.js (classe MinioClientConfig)
- **MinIO Integration**:
    - `src/minio-client.js`: Core interaction with MinIO API.
    - `src/minio-client-multipart.js`: Specialized logic for multipart uploads.
    - `src/client-config.js`: Client configuration class.
- **TB Worker**:
    - `src/background.js`: Main entry point for background tasks and communication between TB and the plugin.
      - Communication from TB to plugin:
        - Plugin register listeners on TB (see specification events): `browser.cloudFile.on<event>>.addListener`
      - Communication from plugin to TB:
        - Plugin calls functions defined on the API: 
          - when account configuration is saved: `browser.cloudFile.updateAccount`
    - `src/LoggerProxy.js`: Standardized logging helper.

