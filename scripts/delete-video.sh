#!/bin/bash

# === Configuration ===
BUCKET_NAME="video-sanitizer"

# === Confirm Before Deleting ===
echo "⚠️  WARNING: This will permanently delete ALL objects from the bucket: $BUCKET_NAME"
read -p "Are you sure you want to continue? (y/n) " confirmation

if [[ "$confirmation" != "y" ]]; then
  echo "❌ Aborted."
  exit 1
fi

# === List and Delete ===
echo "🧹 Deleting all objects from s3://$BUCKET_NAME..."

# Remove all objects
aws s3 rm s3://$BUCKET_NAME --recursive

# Check if deletion succeeded
if [ $? -eq 0 ]; then
  echo "✅ All objects deleted from $BUCKET_NAME."
else
  echo "❌ Failed to delete objects from $BUCKET_NAME."
fi