import {
  TranscribeClient,
  GetTranscriptionJobCommand
} from '@aws-sdk/client-transcribe';

const transcribeClient = new TranscribeClient({
  region: process.env.AWS_REGION
});

export const handler = async (event: any) => {
  console.log('Checking transcription status for:', event);

  const { transcribeJobName } = event;

  if (!transcribeJobName) {
    throw new Error('Missing transcribeJobName in event');
  }

  const response = await transcribeClient.send(
    new GetTranscriptionJobCommand({
      TranscriptionJobName: transcribeJobName
    })
  );

  console.log('Transcription job status response:', JSON.stringify(response));

  const status = response.TranscriptionJob?.TranscriptionJobStatus || 'UNKNOWN';

  const transcriptUri =
    response.TranscriptionJob?.Transcript?.TranscriptFileUri;

  if (status === 'COMPLETED' && transcriptUri) {
    // Extract the key from the URL
    const url = new URL(transcriptUri);
    const transcriptKey = decodeURIComponent(url.pathname.substring(1)); // remove leading '/'

    return {
      status,
      transcriptKey
    };
  }

  return {
    status
  };
};
