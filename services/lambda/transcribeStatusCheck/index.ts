// services/lambda/transcribeStatusCheck/index.ts

import {
  TranscribeClient,
  GetTranscriptionJobCommand
} from '@aws-sdk/client-transcribe';

const transcribeClient = new TranscribeClient({
  region: process.env.AWS_REGION
});

export const handler = async (event: any) => {
  console.log('[Check Status] Received event:', JSON.stringify(event));

  const { transcribeJobName } = event;

  if (!transcribeJobName) {
    console.error('[Check Status] Error: Missing transcribeJobName in event');
    throw new Error('Missing transcribeJobName in event');
  }

  try {
    const response = await transcribeClient.send(
      new GetTranscriptionJobCommand({
        TranscriptionJobName: transcribeJobName
      })
    );

    console.log(
      '[Check Status] AWS Transcribe response:',
      JSON.stringify(response)
    );

    const status =
      response.TranscriptionJob?.TranscriptionJobStatus || 'UNKNOWN';
    const transcriptUri =
      response.TranscriptionJob?.Transcript?.TranscriptFileUri;

    if (status === 'COMPLETED' && transcriptUri) {
      const url = new URL(transcriptUri);
      const transcriptKey = decodeURIComponent(
        url.pathname.replace(/^\/+/, '')
      );

      console.log(
        '[Check Status] Job COMPLETED. Transcript Key:',
        transcriptKey
      );

      return {
        status,
        transcriptKey
      };
    }

    console.log(`[Check Status] Job Status: ${status}`);

    return { status };
  } catch (error) {
    console.error('[Check Status] Error calling AWS Transcribe:', error);
    throw error;
  }
};
