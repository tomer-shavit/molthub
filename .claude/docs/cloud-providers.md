# Cloud Providers — Operational Reference

This document captures hard-won operational knowledge about managing bot infrastructure across cloud providers.

---

## AWS ECS Bot Lifecycle

### Resource Inventory Per Bot

Each ECS-deployed bot creates the following AWS resources:

| Resource | Naming Pattern | Notes |
|---|---|---|
| ECS Cluster | `<bot-name>` | One cluster per bot |
| ECS Task Definition | `<bot-name>:<revision>` | Versioned; old revisions linger |
| EC2 Instance | Tagged `Name: <bot-name>` | EC2-backed ECS deployment |
| CloudFormation Stack | `molthub-bot-<bot-name>` or `clawster-bot-<bot-name>` | Manages infra (SGs, IAM roles, etc.) |
| Secrets Manager | `<prefix>/<bot-name>/config` | OpenClaw config JSON |
| Secrets Manager | `<prefix>/<bot-name>/gateway-token` | Gateway auth token |
| CloudWatch Log Group | `<bot-name>` | Container logs (if configured) |

**Naming prefix varies by version**: older bots use `molthub`, newer ones use `clawster`. Always search for both prefixes when cleaning up.

### Deleting a Bot — Required Order

Resources must be deleted **inside-out**. Attempting to delete a cluster with active tasks or instances will fail with `ClusterContainsTasksException`.

**Step 1: Stop all ECS tasks**

```bash
# List tasks
aws ecs list-tasks --cluster <bot-name> --region us-east-1

# Stop each task
aws ecs stop-task --cluster <bot-name> --task <task-id> --reason "Deleting bot"

# Wait for tasks to clear (tasks in PROVISIONING/DEPROVISIONING still count)
aws ecs list-tasks --cluster <bot-name> --region us-east-1
```

**Step 2: Delete ECS services (if any)**

```bash
aws ecs list-services --cluster <bot-name> --region us-east-1

# For each service: scale to 0, then delete
aws ecs update-service --cluster <bot-name> --service <svc> --desired-count 0
aws ecs delete-service --cluster <bot-name> --service <svc>
```

**Step 3: Terminate EC2 instances (EC2-backed ECS only)**

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=*<bot-name>*" "Name=instance-state-name,Values=running,stopped" \
  --region us-east-1 --query "Reservations[].Instances[].InstanceId" --output text

aws ec2 terminate-instances --instance-ids <instance-id> --region us-east-1
```

**Step 4: Delete the ECS cluster**

```bash
# Only works after tasks, services, and container instances are gone
aws ecs delete-cluster --cluster <bot-name> --region us-east-1
```

**Step 5: Deregister task definitions**

```bash
aws ecs list-task-definitions --family-prefix <bot-name> --region us-east-1
aws ecs deregister-task-definition --task-definition <bot-name>:<revision> --region us-east-1
```

**Step 6: Delete CloudFormation stack**

```bash
# Stack may cascade-delete security groups, IAM roles, etc.
aws cloudformation delete-stack --stack-name <stack-name> --region us-east-1

# Monitor deletion progress
aws cloudformation describe-stacks --stack-name <stack-name> --query "Stacks[0].StackStatus"
```

**Step 7: Delete Secrets Manager secrets**

```bash
# Use --force-delete-without-recovery to skip 30-day retention
aws secretsmanager delete-secret --secret-id "<prefix>/<bot-name>/config" \
  --force-delete-without-recovery --region us-east-1

aws secretsmanager delete-secret --secret-id "<prefix>/<bot-name>/gateway-token" \
  --force-delete-without-recovery --region us-east-1
```

**Step 8: Delete CloudWatch log groups (if any)**

```bash
aws logs delete-log-group --log-group-name <bot-name> --region us-east-1
```

### Gotchas

- **`ClusterContainsTasksException` with 0 visible tasks**: Tasks in `PROVISIONING` or `DEPROVISIONING` states still block cluster deletion. Wait and retry.
- **Naming prefix inconsistency**: Search for both `molthub` and `clawster` prefixes when discovering resources.
- **CloudFormation stack naming**: The stack name uses a `molthub-bot-` or `clawster-bot-` prefix, which differs from the cluster name. Always check `cloudformation list-stacks` with a broad filter.
- **Secrets linger after cluster deletion**: ECS cluster deletion does NOT cascade to Secrets Manager. Always clean up secrets explicitly.
- **Task definitions are never truly deleted**: `deregister-task-definition` marks them INACTIVE but they remain visible in the API. This is normal AWS behavior.

---

## Discovery Commands

Use these to find all bot-related resources in an AWS account:

```bash
# All ECS clusters
aws ecs list-clusters --region us-east-1

# All bot-related CloudFormation stacks
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?contains(StackName, 'molthub') || contains(StackName, 'clawster')]"

# All bot-related secrets
aws secretsmanager list-secrets --region us-east-1 \
  --query "SecretList[?contains(Name, 'molthub') || contains(Name, 'clawster')]"

# All bot-related EC2 instances
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=*molthub*,*clawster*" \
  --region us-east-1
```
