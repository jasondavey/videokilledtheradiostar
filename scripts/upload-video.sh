#!/bin/bash

# === Configuration ===
BUCKET_NAME="video-sanitizer"
UPLOAD_PREFIX="uploads" # Folder in S3 where raw videos go
VIEWER_BASE_URL="https://video-sanitizer.s3.us-east-1.amazonaws.com/sanitized" # URL where final sanitized videos appear

# === Input Argument ===
LOCAL_FILE="$1"

if [ -z "$LOCAL_FILE" ]; then
  echo "❌ Error: No video file specified."
  echo "Usage: ./upload-video.sh path/to/video.mp4"
  exit 1
fi

# === Extract filename ===
FILENAME=$(basename "$LOCAL_FILE")
BASENAME="${FILENAME%.*}" # Remove extension (e.g., narrated-video)

# === Upload ===
S3_DESTINATION="s3://${BUCKET_NAME}/${UPLOAD_PREFIX}/${FILENAME}"

echo "🚀 Uploading $LOCAL_FILE to $S3_DESTINATION ..."

aws s3 cp "$LOCAL_FILE" "$S3_DESTINATION"

if [ $? -eq 0 ]; then
  echo "✅ Upload successful!"

  echo
  echo "🎬 Once processing finishes, you can watch the video here:"
  echo "${VIEWER_BASE_URL}/${BASENAME}.mp4"
  echo "📝 Subtitles should appear automatically from:"
  echo "${VIEWER_BASE_URL}/${BASENAME}.vtt"
else
  echo "❌ Upload failed."
fi