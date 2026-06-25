#!/bin/bash
set -e

# ==========================================
# CONFIGURATION
# ==========================================

VERSION=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="dist"
XPI_NAME="minio-filelink-${VERSION}.xpi"
OUTPUT="${OUTPUT_DIR}/${XPI_NAME}"
SRC_DIR="src"

echo "📦 Construction du plugin MinIO..."
echo "📌 Version: ${VERSION}"
echo "📁 Source: ${SRC_DIR}"

# ==========================================
# VÉRIFICATION DE LA STRUCTURE
# ==========================================

if [ ! -d "$SRC_DIR" ]; then
    echo "❌ ERREUR: Le répertoire ${SRC_DIR} n'existe pas"
    exit 1
fi

if [ ! -f "${SRC_DIR}/manifest.json" ]; then
    echo "❌ ERREUR: manifest.json manquant dans ${SRC_DIR}"
    exit 1
fi

# ==========================================
# CRÉATION DU RÉPERTOIRE DE SORTIE
# ==========================================

mkdir -p "$OUTPUT_DIR"
echo "📁 Répertoire ${OUTPUT_DIR} créé"

# ==========================================
# CRÉATION DU XPI
# ==========================================

TMP=$(mktemp -d)
echo "📂 Dossier temporaire: ${TMP}"

echo "📋 Copie des fichiers..."

# 1. Copier les fichiers racine de src/ (fichiers .js, .html, .json, .png, .css)
echo "  📄 Fichiers racine..."
find "${SRC_DIR}" -maxdepth 1 -type f \( -name "*.js" -o -name "*.html" -o -name "*.json" -o -name "*.png" -o -name "*.svg" -o -name "*.css" \) -exec cp {} "$TMP/" \;

# 2. Copier les fichiers des dossiers (à plat, à la racine)
echo "  📄 Fichiers des dossiers (à plat)..."
for dir in minio settings images worker; do
    if [ -d "${SRC_DIR}/${dir}" ]; then
        find "${SRC_DIR}/${dir}" -maxdepth 1 -type f -exec cp {} "$TMP/" \;
        echo "    - ${dir}/ (fichiers copiés à la racine)"
    else
        echo "    ⚠️  ${dir}/ manquant (ignoré)"
    fi
done

# 3. Copier _locales en conservant la structure
if [ -d "${SRC_DIR}/_locales" ]; then
    echo "  📁 _locales/ (structure conservée)"
    cp -r "${SRC_DIR}/_locales" "$TMP/"
else
    echo "  ⚠️  _locales/ manquant (ignoré)"
fi

# ==========================================
# NETTOYAGE DES FICHIERS INUTILES
# ==========================================

echo "🧹 Nettoyage des fichiers inutiles..."
cd "$TMP"
find . -type f -name "*.DS_Store" -delete 2>/dev/null || true
find . -type f -name "*.thumbs" -delete 2>/dev/null || true
find . -type f -name "*.swp" -delete 2>/dev/null || true
find . -type f -name "*.tmp" -delete 2>/dev/null || true
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# ==========================================
# VÉRIFICATION DES FICHIERS ESSENTIELS
# ==========================================

cd "$OLDPWD"
echo ""
echo "🔍 Vérification des fichiers..."

ESSENTIAL_FILES=(
    "manifest.json"
    "background.js"
    "management.html"
    "management.js"
    "minio-client.js"
    "account-manager.js"
)

MISSING_FILES=()
for file in "${ESSENTIAL_FILES[@]}"; do
    if [ -f "${TMP}/${file}" ]; then
        echo "  ✅ ${file} présent"
    else
        echo "  ❌ ${file} manquant"
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo ""
    echo "❌ ERREUR: Fichiers manquants: ${MISSING_FILES[*]}"
    echo "   Vérifiez la structure de ${SRC_DIR}"
    rm -rf "$TMP"
    exit 1
fi

# ==========================================
# VÉRIFICATION DE _LOCALES
# ==========================================

if [ -d "${TMP}/_locales" ]; then
    echo "  ✅ _locales/ présent"
else
    echo "  ⚠️  _locales/ manquant (les traductions ne seront pas incluses)"
fi

# ==========================================
# LISTE DES FICHIERS DANS LE XPI
# ==========================================

echo ""
echo "📄 Structure du XPI:"
cd "$TMP"
find . -type f | sort | while read -r file; do
    echo "  ${file#./}"
done
cd "$OLDPWD"

# ==========================================
# COMPRESSION
# ==========================================

echo ""
echo "🗜️ Compression du XPI..."

cd "$TMP"
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
echo "📌 Structure du XPI:"
echo "   - Tous les fichiers .js, .html, .json, .png sont à la racine"
echo "   - _locales/ conserve sa structure"
echo ""
echo "📌 Installation dans Thunderbird:"
echo "   1. Ouvrir Thunderbird"
echo "   2. Aller dans Outils > Modules complémentaires"
echo "   3. Cliquer sur l'engrenage ⚙️"
echo "   4. Choisir 'Installer depuis un fichier'"
echo "   5. Sélectionner: ${OUTPUT}"