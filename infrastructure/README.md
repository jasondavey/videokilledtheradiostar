# Video Sanitizer Pipeline (AWS)

This project implements an automated video upload and processing pipeline that:

- Transcribes video audio using Amazon Transcribe
- Redacts profanity with custom lexicons and NLP
- Bleaches audio using FFmpeg
- Creates closed captions
- Merges everything with AWS MediaConvert
- Stores metadata in DynamoDB
- Provides content streaming via CloudFront

## Architecture Overview

## Services Used

- Amazon S3
- Amazon SQS
- AWS Lambda
- AWS Batch
- Amazon Transcribe
- AWS MediaConvert
- Amazon DynamoDB
- Amazon CloudFront
- Amazon Cognito
- AWS CDK

## Getting Started

1. Deploy infrastructure: `cdk deploy`
2. Upload video using signed URL
3. Review processed video and metadata
