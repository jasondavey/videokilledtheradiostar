import {
  TranscribeClient,
  GetTranscriptionJobCommand
} from '@aws-sdk/client-transcribe';
import { logAndReturn } from '../../utils/logReturn';

const transcribeClient = new TranscribeClient({
  region: process.env.AWS_REGION
});

export const handler = async (event: any) => {
  console.log(
    '[Transcribe Check Status] Received event:',
    JSON.stringify(event)
  );

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
      const transcriptKey = decodeURIComponent(url.pathname.substring(1));

      const normalizedKey = transcriptKey.replace(/^video-sanitizer\//, '');

      console.log(`[Check Status] Transcript key: ${normalizedKey}`);

      return logAndReturn({
        status: 'COMPLETED',
        transcriptKey: `transcripts/${transcribeJobName}.json`,
        videoKey: event.videoKey
      });
    }

    console.log(`[Check Status] Job Status: ${status}`);

    return logAndReturn({
      status,
      videoKey: event.videoKey
    });
  } catch (error) {
    console.error('[Check Status] Error calling AWS Transcribe:', error);
    throw error;
  }
};
