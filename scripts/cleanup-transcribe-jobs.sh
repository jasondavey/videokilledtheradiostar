#!/bin/bash

# === Configuration ===
REGION="us-east-1"
STATE_MACHINE_NAME_PREFIX="VideoProcessingStateMachine"

# === Auto-Detect Step Function ARN ===
echo "🔎 Auto-detecting Step Function with prefix '$STATE_MACHINE_NAME_PREFIX' in region $REGION..."

state_machine_info=$(aws stepfunctions list-state-machines \
  --region "$REGION" \
  --query "stateMachines[?starts_with(name, \`$STATE_MACHINE_NAME_PREFIX\`)]" \
  --output json)

state_machine_arn=$(echo "$state_machine_info" | jq -r '.[0].stateMachineArn')
state_machine_name=$(echo "$state_machine_info" | jq -r '.[0].name')

if [ -z "$state_machine_arn" ] || [ "$state_machine_arn" == "null" ]; then
  echo "❌ No matching Step Function found. Exiting."
  exit 1
fi

echo "✅ Found State Machine:"
echo "   Name: $state_machine_name"
echo "   ARN : $state_machine_arn"

# === Detect Workflow Type (Standard or Express) ===
workflow_type=$(aws stepfunctions describe-state-machine \
  --region "$REGION" \
  --state-machine-arn "$state_machine_arn" \
  --query "type" \
  --output text)

echo "🔎 Workflow type detected: $workflow_type"

# === Clean Step Function Executions ===
if [ "$workflow_type" == "STANDARD" ]; then
  echo "⚠️  STANDARD workflows cannot have executions manually deleted."
  echo "✅ Skipping execution cleanup."
else
  echo "🔎 Listing FAILED executions of Express Step Function $state_machine_arn..."

  execution_arns=$(aws stepfunctions list-executions \
    --state-machine-arn "$state_machine_arn" \
    --region "$REGION" \
    --query "executions[?status=='FAILED'].executionArn" \
    --output text)

  if [ -z "$execution_arns" ]; then
    echo "✅ No FAILED executions to clean up."
  else
    echo "🗑️ Found Step Function executions:"
    for exec in $execution_arns; do
      echo "   - $exec"
    done

    echo
    read -p "⚠️  Do you want to delete these Step Function executions? (y/n) " confirmation_exec

    if [[ "$confirmation_exec" == "y" ]]; then
      for exec in $execution_arns; do
        echo "🧹 Deleting Step Function execution: $exec"
        aws stepfunctions delete-execution --execution-arn "$exec" --region "$REGION"
      done
    else
      echo "❌ Skipping Step Function execution deletion."
    fi
  fi
fi

echo "✅ Step Function cleanup complete!"

# === Optionally Clean Transcribe Jobs Too ===
echo
read -p "🗑️  Also delete FAILED Transcribe jobs? (y/n) " confirmation_transcribe

if [[ "$confirmation_transcribe" == "y" ]]; then
  echo "🔎 Listing all FAILED transcription jobs in region $REGION..."

  job_names=$(aws transcribe list-transcription-jobs \
    --status FAILED \
    --region "$REGION" \
    --query "TranscriptionJobSummaries[].TranscriptionJobName" \
    --output text)

  if [ -z "$job_names" ]; then
    echo "✅ No failed transcription jobs to clean up."
  else
    echo "🗑️ Found Transcribe jobs:"
    for job in $job_names; do
      echo "   - $job"
    done

    echo
    read -p "⚠️  Confirm delete Transcribe jobs? (y/n) " confirm_jobs

    if [[ "$confirm_jobs" == "y" ]]; then
      for job in $job_names; do
        echo "🧹 Deleting Transcribe job: $job"
        aws transcribe delete-transcription-job --transcription-job-name "$job" --region "$REGION"
      done
    else
      echo "❌ Skipping Transcribe job deletion."
    fi
  fi
else
  echo "❌ Skipping Transcribe job cleanup."
fi

echo "✅ Full cleanup complete!"