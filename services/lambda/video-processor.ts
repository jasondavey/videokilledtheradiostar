import { SQSHandler } from "aws-lambda";
import { DynamoDB, TranscribeService } from "aws-sdk";

// Set up clients
const dynamoDb = new DynamoDB.DocumentClient();
const transcribe = new TranscribeService();

const METADATA_TABLE = process.env.METADATA_TABLE!;
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET!;

export const handler: SQSHandler = async (event) => {
  console.log("Received SQS event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const s3Event = JSON.parse(record.body);
    const s3Info = s3Event.Records[0].s3;
    const bucketName = s3Info.bucket.name;
    const objectKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));

    const videoId =
      objectKey.split("/").pop()?.split(".")[0] ?? `video-${Date.now()}`;

    console.log(`Processing video: ${objectKey}`);

    // 1. Start a Transcription Job
    const transcribeJobName = `transcribe-${videoId}-${Date.now()}`;

    await transcribe
      .startTranscriptionJob({
        TranscriptionJobName: transcribeJobName,
        LanguageCode: "en-US",
        MediaFormat: "mp4",
        Media: {
          MediaFileUri: `s3://${bucketName}/${objectKey}`,
        },
        OutputBucketName: bucketName,
        OutputKey: `transcriptions/${videoId}.json`,
      })
      .promise();

    console.log(`Started Transcription Job: ${transcribeJobName}`);

    // 2. Insert metadata into DynamoDB
    await dynamoDb
      .put({
        TableName: METADATA_TABLE,
        Item: {
          videoId: videoId,
          videoUploadedDate: new Date().toISOString(),
          videoUploadedBy: "system", // Placeholder, can be user ID if you capture it later
          videoDescription: "Uploaded video",
          processingStatus: "processing",
          s3ObjectKey: objectKey,
          s3Bucket: bucketName,
        },
      })
      .promise();

    console.log(`Metadata stored for videoId: ${videoId}`);
  }
};
