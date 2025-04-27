import { TranscribeService } from "aws-sdk";

const transcribe = new TranscribeService();

export const handler = async (event: any) => {
  console.log("Checking Transcribe job status for:", event);

  const transcribeJobName = event.transcribeJobName;

  const { TranscriptionJob } = await transcribe
    .getTranscriptionJob({
      TranscriptionJobName: transcribeJobName,
    })
    .promise();

  const jobStatus = TranscriptionJob?.TranscriptionJobStatus ?? "UNKNOWN";

  return {
    status: jobStatus,
    transcribeJobName,
    videoId: event.videoId,
    objectKey: event.objectKey,
  };
};
