import { TranscribeService } from "aws-sdk";

const transcribe = new TranscribeService();
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET!;

export const handler = async (event: any) => {
  console.log("Starting Transcribe job for:", event);

  const videoId = event.videoId ?? `video-${Date.now()}`;
  const objectKey = event.objectKey;

  const transcribeJobName = `transcribe-${videoId}-${Date.now()}`;

  transcribe.startTranscriptionJob({
    TranscriptionJobName: transcribeJobName,
    LanguageCode: "en-US",
    MediaFormat: "mp4",
    Media: {
      MediaFileUri: `s3://${UPLOAD_BUCKET}/${objectKey}`,
    },
    OutputBucketName: UPLOAD_BUCKET,
    Settings: {
      ShowSpeakerLabels: false,
      ChannelIdentification: false,
    },
  });

  return {
    transcribeJobName,
    videoId,
    objectKey,
  };
};
