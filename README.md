# Napzzak

> Upload a video, and AI will squish it into a story-based comic strip.

**AWS Nova Hackathon Project**

[한국어 README](./README.ko.md)

---

## Demo

**Live**: https://napzzak.site

![Napzzak Cover](./public/napzzak-cover.png)

---

## Features

- **Video → Comic**: Upload a video file to generate an AI comic
- **3-Step Chain-of-Thought Analysis**: Nova Pro deep analysis — dialogue, actions, and story
- **Adversarial Verification**: 6 counter-questions to auto-correct analysis errors
- **Multi-Agent Panel Division**: Nova Pro 4-stage pipeline (Planner → Consolidator → Descriptor → Reviewer)
- **4 Art Styles**: Graphic Novel / Soft Painting / Flat Vector / 3D Animation
- **Bilingual Dialogue**: Korean ↔ English toggle
- **Voice Narration**: Nova 2 Sonic text-to-speech playback
- **CSS Dialogue Overlay**: Structurally solves AI text rendering limitations

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| AI (Analysis) | Amazon Bedrock Nova Pro |
| AI (Image) | Amazon Bedrock Nova Canvas |
| AI (Voice) | Amazon Bedrock Nova 2 Sonic |
| Speech Recognition | Amazon Transcribe (Streaming) |
| Video Processing | ffmpeg |
| Storage | Amazon S3 |
| DB | Amazon DynamoDB |

---

## AI Models (4)

| Model / Service | Model ID | Role |
|-----------------|----------|------|
| **Nova Pro** | `us.amazon.nova-pro-v1:0` | Pass 1 (3-step CoT analysis) + Adversarial verification + Pass 2 multi-agent (all 4 agents) |
| **Nova Canvas** | `amazon.nova-canvas-v1:0` | Per-panel comic image generation (Budget Allocator prompt) |
| **Nova 2 Sonic** | `amazon.nova-2-sonic-v1:0` | Dialogue voice narration (on-demand) |
| **AWS Transcribe** | Streaming API | Video dialogue extraction + speaker diarization |

---

## Pipeline

```
Video Upload → S3 Storage → Transcribe dialogue + ffmpeg keyframe extraction
  → Pass 1: Step A (Dialogue Verification) → Step B (Action Analysis) → Step C (Story Synthesis)
  → Adversarial Verification (6 counter-questions)
  → Pass 2: P-A (Planner) + P-C (CharConsolidator) parallel → P-B (SceneDescriptor) → P-D (Reviewer)
  → Nova Canvas per-panel image generation (Budget Allocator)
  → Story JSON save → Frontend rendering
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- ffmpeg
- AWS Account (Bedrock, S3, DynamoDB, Transcribe)

### Local Development

```bash
git clone https://github.com/importunate-dev/napzzak.git
cd napzzak
npm install
cp .env.local.example .env.local  # Configure AWS settings
npm run dev
```

### Environment Variables

```
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=<your-account-id>
S3_BUCKET_NAME=napzzak-videos-<account-id>
DYNAMODB_TABLE_NAME=napzzak-jobs-<account-id>
```

---

## Deployment (EC2)

| Item | Value |
|------|-------|
| **Service URL** | https://napzzak.site |
| **SSH** | `ssh -i napzzak-key.pem ec2-user@54.156.75.146` |
| **Instance** | `t4g.small` (ARM64 Graviton) |
| **Region** | `us-east-1` |
| **Domain** | `napzzak.site` (Route 53 + Gabia) |
| **SSL** | Let's Encrypt (auto-renewal) |

### Server Architecture

```
Client → Nginx(:443 SSL) → PM2 → Next.js(:3000) → AWS Services
```

### Deploy

```bash
# Initial deployment on EC2
scp -i napzzak-key.pem -r ./napzzak ec2-user@54.156.75.146:/home/ec2-user/
ssh -i napzzak-key.pem ec2-user@54.156.75.146
bash scripts/deploy-ec2.sh

# Update deployment
ssh -i napzzak-key.pem ec2-user@54.156.75.146
cd /home/ec2-user/napzzak
git pull origin main && npm install && npm run build && pm2 restart napzzak
```

### Operations

```bash
pm2 logs napzzak        # View logs
pm2 restart napzzak     # Restart app
pm2 monit               # Monitor resources
```

---

## Project Structure

```
napzzak/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main page
│   │   └── api/
│   │       ├── upload/           # Video upload + pipeline
│   │       ├── upload-youtube/   # YouTube URL upload
│   │       ├── jobs/[jobId]/     # Job status polling
│   │       ├── narrate/          # Voice narration
│   │       ├── restyle/          # Art style change
│   │       └── analyze-story/    # Story analysis
│   ├── lib/                      # Core logic (bedrock, canvas, pipeline, s3, ...)
│   ├── hooks/                    # React custom hooks
│   └── components/               # UI components
├── scripts/
│   └── deploy-ec2.sh            # EC2 deployment script
└── ARCHITECTURE.md              # Detailed technical architecture
```

---

## Creators

AWS Nova Hackathon Team — **importunate-dev**
