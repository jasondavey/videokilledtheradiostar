#!/bin/bash

# 1. Check prerequisites
if ! command -v say &> /dev/null
then
    echo "❌ 'say' command not found. Are you on macOS? Install ffmpeg separately too."
    exit 1
fi

if ! command -v ffmpeg &> /dev/null
then
    echo "❌ 'ffmpeg' not found. Please install it first."
    exit 1
fi

# 2. Define filenames
TEXT_FILE="story.txt"
AUDIO_FILE="narration.aiff"
AUDIO_MP3="narration.mp3"
VIDEO_FILE="narrated-video.mp4"

# 3. Read text and generate narration audio
echo "🎤 Generating narration from $TEXT_FILE..."
say -f "$TEXT_FILE" -o "$AUDIO_FILE"

# 4. Convert narration to MP3
echo "🎼 Converting narration to MP3..."
ffmpeg -y -i "$AUDIO_FILE" "$AUDIO_MP3"

# 5. Create a blue screen background + merge with narration
echo "🎬 Creating final video with narration..."
ffmpeg -y -f lavfi -i color=c=blue:s=640x480:d=30 -i "$AUDIO_MP3" -shortest -c:v libx264 -c:a aac -pix_fmt yuv420p "$VIDEO_FILE"

# 6. Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -f "$AUDIO_FILE"

# 7. Done
echo "✅ Video generated: $VIDEO_FILE"