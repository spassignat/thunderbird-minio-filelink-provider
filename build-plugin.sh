#!/bin/bash
set -e

VERSION=$(date +"%Y%m%d_%H%M%S")
OUTPUT="minio-filelink-${VERSION}.xpi"

echo "📦 Construction du plugin MinIO..."


# Créer le XPI
TMP=$(mktemp -d)
cp src/* "$TMP/"
[ -d "_locales" ] && cp -r _locales "$TMP/"

cd "$TMP"
zip -q -r "$OUTPUT" ./*
mv "$OUTPUT" "$OLDPWD/"
cd "$OLDPWD"
rm -rf "$TMP"

echo "✅ Plugin construit: $OUTPUT"
echo "📌 Installer dans Thunderbird > Modules > Installer depuis un fichier"