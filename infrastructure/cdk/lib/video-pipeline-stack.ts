import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as logs from 'aws-cdk-lib/aws-logs';

export class VideoPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // === S3 Bucket ===
    const uploadBucket = new s3.Bucket(this, 'UploadBucket', {
      bucketName: 'video-sanitizer',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // === Secure Bucket Policy ===
    uploadBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCDKAutoDeleteRole',
        actions: [
          's3:DeleteObject*',
          's3:GetBucket*',
          's3:List*',
          's3:PutBucketPolicy'
        ],
        principals: [
          new iam.ArnPrincipal(
            'arn:aws:iam::303747928533:role/VideoPipelineStack-CustomS3AutoDeleteObjectsCustomR-5iDS86HgqD6c'
          )
        ],
        resources: [uploadBucket.bucketArn, `${uploadBucket.bucketArn}/*`]
      })
    );

    uploadBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowTranscribeBucketAccess',
        actions: ['s3:GetBucketLocation', 's3:ListBucket'],
        principals: [new iam.ServicePrincipal('transcribe.amazonaws.com')],
        resources: [uploadBucket.bucketArn]
      })
    );

    uploadBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowTranscribeObjectAccess',
        actions: ['s3:GetObject', 's3:PutObject'],
        principals: [new iam.ServicePrincipal('transcribe.amazonaws.com')],
        resources: [`${uploadBucket.bucketArn}/*`]
      })
    );

    uploadBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowPublicReadWriteAccess',
        actions: ['s3:GetObject', 's3:PutObject'],
        principals: [new iam.AnyPrincipal()],
        resources: [`${uploadBucket.bucketArn}/*`]
      })
    );

    // === DynamoDB Table ===
    const videoMetadataTable = new dynamodb.Table(this, 'VideoMetadataTable', {
      tableName: 'VideoMetadata',
      partitionKey: { name: 'videoId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // === Lambda Functions ===
    const transcribeStartLambda = new NodejsFunction(
      this,
      'StartTranscribeLambda',
      {
        functionName: 'start-transcribe',
        description: 'Lambda function to start transcription jobs',
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          '../../../services/lambda/transcribeStart/index.ts'
        ),
        handler: 'handler',
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName
        }
      }
    );

    const startTranscribeLogGroup = new logs.LogGroup(
      this,
      'StartTranscribeLogGroup',
      {
        logGroupName: '/aws/lambda/start-transcribe',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_DAY
      }
    );

    startTranscribeLogGroup.grantWrite(transcribeStartLambda);

    const transcribeStatusCheckLambda = new NodejsFunction(
      this,
      'TranscribeStatusCheckLambda',
      {
        functionName: 'transcribe-status-check',
        description:
          'Lambda function to check the status of transcription jobs',
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          '../../../services/lambda/transcribeStatusCheck/index.ts'
        ),
        handler: 'handler',
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName
        }
      }
    );

    const transcribeStatusCheckLogGroup = new logs.LogGroup(
      this,
      'TranscribeStatusCheckLogGroup',
      {
        logGroupName: '/aws/lambda/transcribe-status-check',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_DAY
      }
    );

    transcribeStatusCheckLogGroup.grantWrite(transcribeStatusCheckLambda);

    const uploadedVideoTriggerLambda = new NodejsFunction(
      this,
      'UploadedVideoTriggerLambda',
      {
        functionName: 'uploaded-video-trigger',
        description: 'Lambda function invoked on video uploads',
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          '../../../services/lambda/uploadedVideoTrigger/index.ts'
        ),
        handler: 'handler'
      }
    );

    const uploadedVideoTriggerLogGroup = new logs.LogGroup(
      this,
      'UploadedVideoTriggerLogGroup',
      {
        logGroupName: '/aws/lambda/uploaded-video-trigger',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_DAY
      }
    );

    uploadedVideoTriggerLogGroup.grantWrite(uploadedVideoTriggerLambda);

    const videoMergerLambda = new NodejsFunction(this, 'VideoMergerLambda', {
      functionName: 'video-merger',
      description: 'Lambda to merge sanitized video with subtitles',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.resolve(
        __dirname,
        '../../../services/lambda/videoMerger/index.ts'
      ),
      handler: 'handler',
      environment: {
        UPLOAD_BUCKET: uploadBucket.bucketName
      }
    });

    uploadBucket.grantReadWrite(videoMergerLambda);

    const videoMergerLogGroup = new logs.LogGroup(this, 'VideoMergerLogGroup', {
      logGroupName: '/aws/lambda/video-merger',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    });
    videoMergerLogGroup.grantWrite(videoMergerLambda);

    const subtitleConverterLambda = new NodejsFunction(
      this,
      'SubtitleConverterLambda',
      {
        functionName: 'subtitle-converter',
        description: 'Lambda to convert transcripts to subtitles',
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          '../../../services/lambda/subtitleConverter/index.ts'
        ),
        handler: 'handler',
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName
        }
      }
    );

    uploadBucket.grantReadWrite(subtitleConverterLambda);

    const subtitleConverterLogGroup = new logs.LogGroup(
      this,
      'SubtitleConverterLogGroup',
      {
        logGroupName: '/aws/lambda/subtitle-converter',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_DAY
      }
    );

    subtitleConverterLogGroup.grantWrite(subtitleConverterLambda);

    const ffmpegLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'FFmpegLayer',
      'arn:aws:lambda:us-east-1:303747928533:layer:ffmpeg:2'
    );

    const attachSubtitlesLambda = new NodejsFunction(
      this,
      'AttachSubtitlesLambda',
      {
        functionName: 'attach-subtitles',
        description: 'Adds subtitles to video using ffmpeg',
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          '../../../services/lambda/attachSubtitles/index.ts'
        ),
        handler: 'handler',
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName
        },
        layers: [ffmpegLayer],
        timeout: cdk.Duration.minutes(5),
        memorySize: 2048
      }
    );

    // Grant read/write access to the bucket
    uploadBucket.grantReadWrite(attachSubtitlesLambda);

    // === Log Group for AttachSubtitlesLambda ===
    const attachSubtitlesLogGroup = new logs.LogGroup(
      this,
      'AttachSubtitlesLogGroup',
      {
        logGroupName: '/aws/lambda/attach-subtitles',
        retention: logs.RetentionDays.ONE_DAY,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }
    );

    // Allow Lambda to write to its log group
    attachSubtitlesLogGroup.grantWrite(attachSubtitlesLambda);

    const profanityScannerLambda = new NodejsFunction(
      this,
      'ProfanityScannerLambda',
      {
        functionName: 'profanity-scanner',
        description:
          'Scans transcript for profanities and returns timestamp ranges',
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          '../../../services/lambda/profanityScanner/index.ts'
        ),
        handler: 'handler',
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 512
      }
    );

    // Grant read access to the bucket
    uploadBucket.grantRead(profanityScannerLambda);

    profanityScannerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [`${uploadBucket.bucketArn}/transcripts/*`]
      })
    );

    // === Log Group for AttachSubtitlesLambda ===
    const profanityScannerLogGroup = new logs.LogGroup(
      this,
      'ProfanityScannerLogGroup',
      {
        logGroupName: '/aws/lambda/profanity-scanner',
        retention: logs.RetentionDays.ONE_DAY,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }
    );

    profanityScannerLogGroup.grantWrite(profanityScannerLambda);

    const audioCensorLambda = new NodejsFunction(this, 'AudioCensorLambda', {
      functionName: 'audio-censor',
      description: 'Silences profane segments in video audio',
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.resolve(
        __dirname,
        '../../../services/lambda/audioCensor/index.ts'
      ),
      handler: 'handler',
      environment: {
        UPLOAD_BUCKET: uploadBucket.bucketName
      },
      layers: [ffmpegLayer], // ✅ Assumes FFmpeg layer
      timeout: cdk.Duration.minutes(1)
    });

    uploadBucket.grantReadWrite(audioCensorLambda);

    new logs.LogGroup(this, 'AudioCensorLogGroup', {
      logGroupName: '/aws/lambda/audio-censor',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    }).grantWrite(audioCensorLambda);

    // === Grant Permissions to Lambdas ===
    transcribeStartLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['transcribe:StartTranscriptionJob'],
        resources: ['*']
      })
    );

    transcribeStatusCheckLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['transcribe:GetTranscriptionJob'],
        resources: ['*']
      })
    );

    uploadBucket.grantRead(transcribeStartLambda);
    uploadBucket.grantRead(uploadedVideoTriggerLambda);

    // === Step Function Workflow ===
    const startJob = new tasks.LambdaInvoke(this, 'Start Transcribe Job', {
      lambdaFunction: transcribeStartLambda,
      outputPath: '$.Payload'
    });

    const waitTime = 30;
    const waitX = new sfn.Wait(this, `Wait ${waitTime} seconds`, {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitTime))
    });

    const checkJob = new tasks.LambdaInvoke(this, 'Check Transcribe Status', {
      lambdaFunction: transcribeStatusCheckLambda,
      payload: sfn.TaskInput.fromJsonPathAt('$'),
      outputPath: '$.Payload'
    });

    const jobSucceeded = new sfn.Choice(this, 'Job Complete?');

    const profanityScannerTask = new tasks.LambdaInvoke(
      this,
      'Scan for Profanity',
      {
        lambdaFunction: profanityScannerLambda,
        payload: sfn.TaskInput.fromJsonPathAt('$'),
        outputPath: '$.Payload'
      }
    );

    const audioCensorshipTask = new tasks.LambdaInvoke(this, 'Censor Audio', {
      lambdaFunction: audioCensorLambda,
      payload: sfn.TaskInput.fromJsonPathAt('$'),
      outputPath: '$.Payload'
    });

    const convertSubtitlesTask = new tasks.LambdaInvoke(
      this,
      'Convert Subtitles',
      {
        lambdaFunction: subtitleConverterLambda,
        payload: sfn.TaskInput.fromJsonPathAt('$'),
        outputPath: '$.Payload'
      }
    );

    const attachSubtitlesTask = new tasks.LambdaInvoke(
      this,
      'Attach Subtitles',
      {
        lambdaFunction: attachSubtitlesLambda,
        payload: sfn.TaskInput.fromJsonPathAt('$'),
        outputPath: '$.Payload'
      }
    );

    const mergeVideo = new tasks.LambdaInvoke(
      this,
      'Merge Video and Subtitles',
      {
        lambdaFunction: videoMergerLambda,
        payload: sfn.TaskInput.fromJsonPathAt('$'),
        outputPath: '$.Payload'
      }
    );

    const conversionSucceeded = new sfn.Choice(this, 'Conversion Succeeded?')
      .when(
        sfn.Condition.stringEquals('$.status', 'SUCCESS'),
        attachSubtitlesTask
          .next(mergeVideo)
          .next(new sfn.Succeed(this, 'Subtitles Attached Successfully'))
      )
      .otherwise(new sfn.Fail(this, 'Subtitle Conversion Failed'));

    const definition = startJob
      .next(waitX)
      .next(checkJob)
      .next(
        jobSucceeded
          .when(sfn.Condition.stringEquals('$.status', 'IN_PROGRESS'), waitX)
          .when(
            sfn.Condition.stringEquals('$.status', 'FAILED'),
            new sfn.Fail(this, 'Transcribe Failed')
          )
          .when(
            sfn.Condition.stringEquals('$.status', 'COMPLETED'),
            profanityScannerTask
              .next(audioCensorshipTask)
              .next(convertSubtitlesTask)
              .next(conversionSucceeded)
          )
      );

    const stateMachineLogGroup = new logs.LogGroup(
      this,
      'VideoProcessingStateMachineLogGroup',
      {
        logGroupName: '/aws/videopipeline/statemachine',
        retention: logs.RetentionDays.ONE_DAY,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }
    );

    const stateMachine = new sfn.StateMachine(
      this,
      'VideoProcessingStateMachine',
      {
        definitionBody: sfn.DefinitionBody.fromChainable(definition),
        timeout: cdk.Duration.minutes(30),
        stateMachineName: 'VideoProcessingStateMachine',
        logs: {
          destination: stateMachineLogGroup,
          level: sfn.LogLevel.ALL,
          includeExecutionData: true
        }
      }
    );

    uploadedVideoTriggerLambda.addEnvironment(
      'STATE_MACHINE_ARN',
      stateMachine.stateMachineArn
    );

    stateMachine.grantStartExecution(uploadedVideoTriggerLambda);

    // === S3 Trigger for Uploads ===
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(uploadedVideoTriggerLambda),
      { prefix: 'uploads/', suffix: '.mp4' } // <- Only .mp4 videos in /uploads/
    );

    // === Outputs ===
    new cdk.CfnOutput(this, 'UploadBucketName', {
      value: uploadBucket.bucketName,
      description: 'The name of the video upload bucket'
    });

    new cdk.CfnOutput(this, 'VideoMetadataTableName', {
      value: videoMetadataTable.tableName,
      description: 'The name of the DynamoDB Video Metadata table'
    });
  }
}
