#!/bin/bash

# === Configuration ===
LAMBDA_NAME="audio-censor"
VIDEO_KEY="uploads/lambda-test-input.mp4"
TRANSCRIPT_KEY="transcripts/transcribe-lambda-test-input-1745999999999.json"
OUTPUT_FILE="./output.json"

# === Write JSON payload to file ===
cat > event.json <<EOF
{
  "videoKey": "${VIDEO_KEY}",
  "transcriptKey": "${TRANSCRIPT_KEY}",
  "profanityTimestamps": [
    { "word": "duck", "start": "2.0", "end": "2.5" },
    { "word": "ducks", "start": "5.0", "end": "5.5" }
  ]
}
EOF

echo "📦 Payload written to event.json"

# === Invoke Lambda ===
aws lambda invoke \
  --function-name "$LAMBDA_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload file://event.json \
  "$OUTPUT_FILE"

# === Output Result ===
echo "✅ Lambda response written to $OUTPUT_FILE"
cat "$OUTPUT_FILE"

# Optional: Clean up
# rm event.json "$OUTPUT_FILE"