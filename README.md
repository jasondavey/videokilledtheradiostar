# Video Killed The Radio Star - Video Sanitizer

A serverless AWS-based video processing pipeline that automatically transcribes, censors profanity, and generates sanitized video content with subtitles.

## Overview

This project implements a comprehensive video processing system that:
- Automatically transcribes video audio using AWS Transcribe
- Detects and censors profanity in transcriptions
- Generates and attaches subtitles to videos
- Provides a complete serverless infrastructure using AWS CDK

## Architecture

The system is built using AWS serverless technologies:

- **AWS Lambda Functions**: Core processing logic
- **AWS S3**: Video storage and hosting
- **AWS Transcribe**: Audio-to-text transcription
- **AWS Step Functions**: Workflow orchestration
- **AWS CDK**: Infrastructure as Code

## Project Structure

```
├── infrastructure/          # AWS CDK infrastructure code
│   └── cdk/                # CDK configuration and deployment
├── services/               # Lambda functions and utilities
│   ├── lambda/            # Individual Lambda function handlers
│   │   ├── attachSubtitles/
│   │   ├── audioCensor/
│   │   ├── profanityScanner/
│   │   ├── subtitleConverter/
│   │   ├── transcribeStart/
│   │   └── ...
│   └── utils/             # Shared utilities
│       ├── logReturn.ts
│       └── profanityFilter.ts
├── scripts/               # Utility scripts for testing and management
├── metadata/              # Sample data and configurations
└── package.json          # Node.js dependencies
```

## Key Features

### 🎯 **Profanity Detection & Censoring**
- Configurable profanity word list
- Real-time text filtering with `****` replacement
- Maintains original text structure

### 📝 **Subtitle Generation**
- Automatic subtitle creation from transcriptions
- Multiple subtitle format support
- Seamless video integration

### 🔄 **Processing Pipeline**
1. Video upload triggers processing
2. Audio transcription via AWS Transcribe
3. Profanity scanning and censoring
4. Subtitle generation and attachment
5. Final sanitized video output

### 🛠 **Management Tools**
- Video upload/delete scripts
- Transcription job cleanup utilities
- Validation and testing scripts

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate permissions
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- TypeScript compiler

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd videokilledtheradiostar
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install CDK dependencies**
   ```bash
   cd infrastructure/cdk
   npm install
   cd ../..
   ```

## Deployment

1. **Bootstrap CDK (first time only)**
   ```bash
   cd infrastructure/cdk
   cdk bootstrap
   ```

2. **Deploy the infrastructure**
   ```bash
   cdk deploy
   ```

3. **Note the output values** (S3 bucket names, API endpoints, etc.)

## Usage

### Upload a Video
```bash
./scripts/upload-video.sh path/to/your/video.mp4
```

### Monitor Processing
Check AWS CloudWatch logs or use the validation script:
```bash
./scripts/validate-s3-video-sanitizer.sh
```

### Clean Up Transcribe Jobs
```bash
./scripts/cleanup-transcribe-jobs.sh
```

### Delete a Video
```bash
./scripts/delete-video.sh video-id
```

## Configuration

### Profanity Filter
Edit `services/utils/profanityFilter.ts` to customize the profanity word list:

```typescript
const PROFANITY_LIST = ['word1', 'word2', 'word3'];
```

### AWS Resources
Modify CDK configuration in `infrastructure/cdk/` to adjust:
- Lambda memory/timeout settings
- S3 bucket configurations
- Step Function workflows

## Development

### Local Testing
```bash
# Test individual Lambda functions
./scripts/invoke-audio-censor.sh

# Test with sample event
node -e "console.log(require('./scripts/event.json'))"
```

### Building
```bash
npm run build  # Compiles TypeScript
```

### Linting
```bash
npm run lint   # Code formatting with Prettier
```

## Monitoring

- **CloudWatch Logs**: Monitor Lambda execution logs
- **Step Functions Console**: Track workflow progress
- **S3 Console**: View processed videos and metadata

## Cost Optimization

- Lambda functions use minimal memory allocation
- S3 lifecycle policies for automatic cleanup
- Transcribe jobs are cleaned up automatically
- Pay-per-use pricing model

## Security

- IAM roles with least-privilege access
- S3 bucket policies restrict unauthorized access
- Lambda functions run in isolated environments
- No hardcoded credentials

## Troubleshooting

### Common Issues

1. **Transcription Fails**
   - Check audio quality and format
   - Verify AWS Transcribe service limits
   - Review CloudWatch logs

2. **Lambda Timeouts**
   - Increase timeout in CDK configuration
   - Optimize processing logic
   - Consider breaking into smaller functions

3. **S3 Access Denied**
   - Verify IAM permissions
   - Check bucket policies
   - Ensure correct AWS region

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues and questions:
- Check CloudWatch logs for detailed error messages
- Review AWS service documentation
- Open an issue in the repository

---

**Note**: This system processes video content and applies content filtering. Ensure compliance with your organization's content policies and applicable regulations.
