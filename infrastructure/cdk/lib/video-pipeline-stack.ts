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
      outputPath: '$.Payload'
    });

    const jobSucceeded = new sfn.Choice(this, 'Job Complete?');

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
            new sfn.Succeed(this, 'Transcription Completed Successfully')
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
