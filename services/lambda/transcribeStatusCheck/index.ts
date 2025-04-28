import {
  TranscribeClient,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";

const transcribeClient = new TranscribeClient({
  region: process.env.AWS_REGION,
});

export const handler = async (event: any) => {
  console.log("Checking transcription status for:", event);

  const { transcribeJobName } = event;

  if (!transcribeJobName) {
    throw new Error("Missing transcribeJobName in event");
  }

  const response = await transcribeClient.send(
    new GetTranscriptionJobCommand({
      TranscriptionJobName: transcribeJobName,
    })
  );

  console.log("Transcription job status response:", response);

  const status = response.TranscriptionJob?.TranscriptionJobStatus || "UNKNOWN";

  return {
    status,
  };
};
