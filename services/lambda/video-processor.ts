import { SQSHandler } from "aws-lambda";
import { DynamoDB, TranscribeService } from "aws-sdk";

// Setup AWS clients
const dynamoDb = new DynamoDB.DocumentClient();
const transcribe = new TranscribeService();

// Environment variables (set from CDK)
const METADATA_TABLE = process.env.METADATA_TABLE!;
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET!;

export const handler: SQSHandler = async (event) => {
  console.log("Received SQS event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const s3Event = JSON.parse(record.body);
      const s3Info = s3Event.Records[0].s3;
      const bucketName = s3Info.bucket.name;
      const objectKey = decodeURIComponent(
        s3Info.object.key.replace(/\+/g, " ")
      );

      const videoId =
        objectKey.split("/").pop()?.split(".")[0] ?? `video-${Date.now()}`;

      console.log(`Processing video: ${objectKey}`);

      // 1. Start a Transcribe job
      const transcribeJobName = `transcribe-${videoId}-${Date.now()}`;

      await transcribe
        .startTranscriptionJob({
          TranscriptionJobName: transcribeJobName,
          LanguageCode: "en-US", // Customize if you want multi-language
          MediaFormat: "mp4", // Change if you support different formats
          Media: {
            MediaFileUri: `s3://${bucketName}/${objectKey}`,
          },
          OutputBucketName: UPLOAD_BUCKET,
          OutputKey: `transcriptions/${videoId}.json`,
        })
        .promise();

      console.log(`Started transcription job: ${transcribeJobName}`);

      // 2. Insert metadata record into DynamoDB
      await dynamoDb
        .put({
          TableName: METADATA_TABLE,
          Item: {
            videoId: videoId,
            videoUploadedDate: new Date().toISOString(),
            videoUploadedBy: "system", // Placeholder — later link to user if needed
            videoDescription: "Uploaded video", // Placeholder
            processingStatus: "processing",
            originalBucket: bucketName,
            originalObjectKey: objectKey,
            transcriptionJobName: transcribeJobName,
          },
        })
        .promise();

      console.log(`Inserted metadata for videoId: ${videoId}`);
    } catch (error) {
      console.error("Failed to process record:", error);
    }
  }
};
