import {
  TranscribeClient,
  StartTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET!;
const AWS_REGION = process.env.AWS_REGION!;

const transcribeClient = new TranscribeClient({
  region: AWS_REGION,
});

export const handler = async (event: any) => {
  console.log("Starting transcription for:", event);

  let objectKey: string | undefined;

  if (event.Records && event.Records[0]?.s3?.object?.key) {
    objectKey = decodeURIComponent(
      event.Records[0].s3.object.key.replace(/\+/g, " ")
    );
  } else if (event.objectKey) {
    objectKey = event.objectKey;
  }

  if (!objectKey) {
    throw new Error("S3 object key not found in event");
  }

  const videoId = objectKey.split(".")[0];
  const transcribeJobName = `transcribe-${videoId}-${Date.now()}`;

  const mediaFileUri = `https://${UPLOAD_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${objectKey}`;

  console.log(`Starting transcription job for ${mediaFileUri}`);

  await transcribeClient.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: transcribeJobName,
      LanguageCode: "en-US",
      MediaFormat: "mp4",
      Media: {
        MediaFileUri: mediaFileUri,
      },
      OutputBucketName: UPLOAD_BUCKET,
      Settings: {
        ShowSpeakerLabels: false,
        ChannelIdentification: false,
      },
    })
  );

  console.log("Successfully started transcription job:", transcribeJobName);

  return {
    transcribeJobName,
    videoId,
    objectKey,
  };
};
