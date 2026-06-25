#!/bin/bash
set -e

# ==========================================
# CONFIGURATION
# ==========================================

VERSION=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="dist"
XPI_NAME="minio-filelink-${VERSION}.xpi"
OUTPUT="${OUTPUT_DIR}/${XPI_NAME}"

echo "📦 Construction du plugin MinIO..."
echo "📌 Version: ${VERSION}"

# ==========================================
# CRÉATION DU RÉPERTOIRE DE SORTIE
# ==========================================

if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    echo "📁 Répertoire ${OUTPUT_DIR} créé"
fi

# ==========================================
# CRÉATION DU XPI
# ==========================================

TMP=$(mktemp -d)
echo "📂 Dossier temporaire: ${TMP}"

# Copier les fichiers sources
echo "📋 Copie des fichiers..."

# Fichiers du répertoire courant
cp -r _locales "$TMP/" 2>/dev/null || true
pwd
# Dossiers spécifiques (si existants)
for dir in minio settings worker images ; do
    if [ -d "$dir" ]; then
        find "$dir" -maxdepth 1 -type f -exec cp {} "$TMP/" \;
        echo "  📁 $dir"
    fi
done

# Copier manifest.json (priorité au fichier principal)
if [ -f "manifest.json" ]; then
    cp manifest.json "$TMP/"
    echo "  📄 manifest.json"
fi

# ==========================================
# VÉRIFICATION DES FICHIERS ESSENTIELS
# ==========================================

echo ""
echo "🔍 Vérification des fichiers..."

if [ -f "$TMP/manifest.json" ]; then
    echo "  ✅ manifest.json présent"
else
    echo "  ❌ ERREUR: manifest.json manquant"
    exit 1
fi

# Vérifier la présence des fichiers de background
if [ -f "$TMP/background.js" ]; then
    echo "  ✅ background.js présent"
else
    echo "  ⚠️  background.js manquant (vérifiez le chemin)"
fi

# Vérifier les fichiers de l'interface
for file in management.html management.js; do
    if [ -f "$TMP/$file" ]; then
        echo "  ✅ $file présent"
    else
        echo "  ⚠️  $file manquant"
    fi
done

# ==========================================
# COMPRESSION
# ==========================================

echo ""
echo "🗜️ Compression du XPI..."

cd "$TMP"

# Compresser avec exclusion des fichiers inutiles
find . -type f -name "*.DS_Store" -delete 2>/dev/null || true
find . -type f -name "*.thumbs" -delete 2>/dev/null || true

# Créer le XPI (zip)
zip -q -r "$OLDPWD/$OUTPUT" ./*

cd "$OLDPWD"

# ==========================================
# NETTOYAGE
# ==========================================

rm -rf "$TMP"
echo "🧹 Nettoyage terminé"

# ==========================================
# RÉSULTAT
# ==========================================

echo ""
echo "=========================================="
echo "✅ Plugin construit avec succès !"
echo "📦 Fichier: ${OUTPUT}"
echo "📏 Taille: $(du -h "$OUTPUT" | cut -f1)"
echo "=========================================="
echo ""
echo "📌 Installation dans Thunderbird:"
echo "   1. Ouvrir Thunderbird"
echo "   2. Aller dans Outils > Modules complémentaires"
echo "   3. Cliquer sur l'engrenage ⚙️"
echo "   4. Choisir 'Installer depuis un fichier'"
echo "   5. Sélectionner: ${OUTPUT}"
echo ""
echo "📌 Test rapide:"
echo "   - Vérifier que le plugin apparaît dans les modules"
echo "   - Configurer un compte MinIO"
echo "   - Tester l'upload d'un fichier"