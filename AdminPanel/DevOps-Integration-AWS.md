# DevOps & Integration (in AWS) Module

## Purpose
The **DevOps & Integration (in AWS)** module outlines the cloud infrastructure architecture, AWS managed service integrations, CI/CD deployment pipelines, container orchestration, monitoring, and disaster recovery strategies for BlackNexa.

---

## Core Infrastructure Architecture

### 1. AWS Cloud Architecture Overview
```
                          [ Amazon CloudFront (CDN) ]
                                      │
                         [ AWS WAF (Web App Firewall) ]
                                      │
                    [ Application Load Balancer (ALB) ]
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
   [ Amazon ECS (Fargate) ]                       [ Amazon ECS (Fargate) ]
   (BlackNexa Backend API)                        (BlackNexa AI Engine)
              │                                               │
     ┌────────┴────────┬─────────────────────┬────────────────┴────────┐
     ▼                 ▼                     ▼                         ▼
[ Amazon RDS ]  [ Amazon ElastiCache ]  [ Amazon S3 ]           [ Amazon SQS ]
 (PostgreSQL)       (Redis Cluster)    (Evidence & Media)     (Async Job Queue)
```

---

## 2. Core AWS Managed Services

### A. Compute & Container Orchestration
* **Amazon ECS (AWS Fargate):** Serverless container compute running the Node.js TypeScript API (`blacknexa-backend`) and Python AI inference worker (`blacknexa-ai-engine`).
* **Auto-Scaling Policies:** Target tracking on CPU (70%) and Memory (80%) with multi-AZ redundancy.

### B. Database & Caching Layer
* **Amazon RDS for PostgreSQL (Multi-AZ):** High-availability relational store for users, incidents, reports, and audit ledgers with automated daily snapshots and point-in-time recovery (PITR).
* **Amazon ElastiCache for Redis:** In-memory caching for session tokens, rate-limiting counters, and real-time dashboard analytics.

### C. Media Storage & Content Delivery
* **Amazon S3 (Encrypted at Rest via AWS KMS):** Secure evidence vault for audio, video, PDF witness statements, and news cover images.
* **Amazon CloudFront:** Global CDN caching for public news feeds, static assets, and low-latency API delivery.
* **AWS WAF (Web Application Firewall):** DDoS mitigation, SQL injection prevention, and IP rate-limiting.

### D. Asynchronous Job & Worker Pipeline
* **Amazon SQS (Simple Queue Service):** Decoupled queues for heavy background tasks:
  * Automated AI keyword & sentiment scans.
  * Audio Briefing Text-to-Speech (TTS) generation.
  * Multi-language article translations.
  * Nightly data pruning and GDPR compliance erasure.

---

## 3. DevOps, CI/CD & Observability

### A. CI/CD Pipeline (GitHub Actions $\rightarrow$ AWS ECR $\rightarrow$ ECS)
1. **Lint & Test Gate:** Automated ESLint, TypeScript compilation, and Jest test suite on every PR.
2. **Container Build:** Docker multi-stage builds pushed to **Amazon ECR (Elastic Container Registry)**.
3. **Zero-Downtime Deployment:** Rolling ECS task updates with ALB health check validation.

### B. Monitoring, Logging & Alerting
* **Amazon CloudWatch & Container Insights:** Metrics for container health, API latency, and 5xx error spikes.
* **AWS CloudTrail:** Complete governance and compliance logging for AWS API calls.
* **PagerDuty / Slack Alerting:** Automated incident dispatches on critical infrastructure errors.

### C. Secrets & Environment Management
* **AWS Secrets Manager & Parameter Store:** Zero plaintext credentials in code repositories; dynamic secret rotation for database connection strings, JWT keys, and third-party APIs.
