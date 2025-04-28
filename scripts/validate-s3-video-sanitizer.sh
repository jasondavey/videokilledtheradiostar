#!/bin/bash

# === Configuration ===
BUCKET_NAME="video-sanitizer"
OBJECT_KEY="$1"  # pass the object key (filename) as first argument

# === Check if Object Key is Provided ===
if [ -z "$OBJECT_KEY" ]; then
  echo "❌ Error: No object key provided."
  echo "Usage: ./validate-s3-upload.sh narrated-video.mp4"
  exit 1
fi

# === 1. Check if object exists ===
echo "🔍 Checking if s3://$BUCKET_NAME/$OBJECT_KEY exists..."
aws s3api head-object --bucket "$BUCKET_NAME" --key "$OBJECT_KEY"

if [ $? -ne 0 ]; then
  echo "❌ Object not found in bucket. Aborting."
  exit 1
fi

echo "✅ Object found!"

# === 2. Check if bucket policy allows Transcribe ===
echo "🔍 Checking bucket policy for transcribe.amazonaws.com access..."
BUCKET_POLICY=$(aws s3api get-bucket-policy --bucket "$BUCKET_NAME" --query "Policy" --output text)

if [[ "$BUCKET_POLICY" == *"transcribe.amazonaws.com"* ]]; then
  echo "✅ Bucket policy grants access to Transcribe."
else
  echo "❌ Transcribe permissions not detected in bucket policy!"
  exit 1
fi

# === 3. Check if uploaded object has audio track ===
echo "🔍 Checking if the uploaded video has audio track (requires ffprobe)..."

aws s3 cp "s3://$BUCKET_NAME/$OBJECT_KEY" temp-uploaded-file.mp4

if ! command -v ffprobe &> /dev/null
then
    echo "⚠️  'ffprobe' not installed. Skipping audio check."
else
    AUDIO_STREAMS=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 temp-uploaded-file.mp4)
    if [ -z "$AUDIO_STREAMS" ]; then
      echo "❌ No audio stream found in uploaded video!"
      rm temp-uploaded-file.mp4
      exit 1
    else
      echo "✅ Audio track detected."
    fi
fi

# === 4. Check if S3 bucket and Lambda are same region ===
echo "🔍 Checking bucket location..."
BUCKET_REGION=$(aws s3api get-bucket-location --bucket "$BUCKET_NAME" --query "LocationConstraint" --output text)

# Handle special case for us-east-1
if [ "$BUCKET_REGION" == "null" ] || [ "$BUCKET_REGION" == "None" ]; then
  BUCKET_REGION="us-east-1"
fi

CURRENT_REGION=$(aws configure get region)

if [ "$BUCKET_REGION" == "$CURRENT_REGION" ]; then
  echo "✅ Bucket region matches configured region: $CURRENT_REGION"
else
  echo "❌ Region mismatch! Bucket is in $BUCKET_REGION but CLI is in $CURRENT_REGION."
  exit 1
fi

# === Cleanup ===
rm temp-uploaded-file.mp4

# === Done ===
echo "🎉 Validation passed! Ready to start transcription."