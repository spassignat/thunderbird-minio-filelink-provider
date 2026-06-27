# MinIO Filelink

Thunderbird extension that adds MinIO as a cloud file provider for the "Send large attachments via link" (Filelink) feature.

## Source Code

This repository contains the complete source code for the extension.  
**No build step is required.** The code is delivered as-is, readable and unminified.

### File Structure
```
.
├── account-manager.js
├── a.tree
├── background.js
├── client-config.js
├── icon16.png
├── icon32.png
├── icon48.png
├── icon64.png
├── _locales
│   ├── en
│   │   └── messages.json
│   └── zh_CN
│       └── messages.json
├── Logger.js
├── LoggerProxy.js
├── management.html
├── management.js
├── manifest.json
└── minio-client.js

```

### Key Features

- Adds MinIO as a Filelink provider in Thunderbird
- Multiple MinIO account management
- Dedicated configuration interface
- Multilingual support (English, Simplified Chinese)

## Code Review Information

For AMO reviewers:

- The submitted source code is **exactly** the code loaded in Thunderbird.
- No external tools (minifiers, bundlers, transpilers) are used.
- All files are directly readable and verifiable.
- Code is clearly structured and organized.

### Dependencies

This extension uses **no external third-party libraries**.  
All code is written in vanilla JavaScript, compatible with Thunderbird's WebExtension environment.

### Thunderbird APIs Used

- `cloudFile` - Filelink service integration
- `storage` - Configuration persistence
- `runtime` - Script communication
- `i18n` - Internationalization

## AMO Submission Details

- **Extension ID** : `[Update with your manifest.json value]`
- **Version** : `[Update with your manifest.json value]`
- **Type** : WebExtension (Thunderbird 115+ compatible)
- **Supported Languages** : English (en), Simplified Chinese (zh_CN)

### Key Files for Review

| File | Purpose |
|------|---------|
| `manifest.json` | Permissions and script declarations |
| `background.js` | Entry point, Filelink event listeners |
| `minio-client.js` | MinIO API communication |
| `account-manager.js` | User account management |
| `management.js` | Configuration interface logic |

## Installation / Testing

To test this extension during development:

1. Open Thunderbird.
2. Go to Add-ons Manager (`Ctrl+Shift+A`).
3. Click the gear icon ⚙️ → "Debug Add-ons".
4. Click "Load Temporary Add-on".
5. Select the `manifest.json` file from this folder.

### Post-Installation Setup

1. In Thunderbird, go to **Preferences** → **Attachments** → **Send attachments via link**.
2. Select **MinIO** as the provider.
3. Click **Manage Accounts** to configure your MinIO credentials (endpoint, access key, secret key, bucket).
