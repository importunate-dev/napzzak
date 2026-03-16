# 납짝 (Napzzak) - EC2 배포 문서

> 작성일: 2026-03-16

---

## 1. 접속 정보

| 항목 | 값 |
|------|-----|
| **서비스 URL** | http://54.156.75.146 |
| **SSH 접속** | `ssh -i napzzak-key.pem ec2-user@54.156.75.146` |
| **Public IP** | `54.156.75.146` |
| **Private IP** | `172.31.35.112` |
| **리전** | `us-east-1` (US East - N. Virginia) |

---

## 2. EC2 인스턴스 정보

| 항목 | 값 |
|------|-----|
| **Instance ID** | `i-02983dbf2e58d87c3` |
| **Name 태그** | `napzzak` |
| **인스턴스 타입** | `t4g.small` (ARM64, 2 vCPU, 2GB RAM) |
| **AMI** | `ami-0d77ef7f6a82c86be` |
| **아키텍처** | `arm64` (Graviton) |
| **플랫폼** | Linux/UNIX |
| **키 페어** | `napzzak-key` |
| **가용 영역** | `us-east-1d` |
| **VPC** | `vpc-0567a8aadb4d481f1` |
| **서브넷** | `subnet-0d2ff0fbfb78b4fe4` |
| **시작 시간** | 2026-03-16 09:50:13 UTC |

---

## 3. 보안 그룹 (napzzak-sg)

| 프로토콜 | 포트 | 소스 | 용도 |
|----------|------|------|------|
| TCP | 22 | 0.0.0.0/0 | SSH 접속 |
| TCP | 80 | 0.0.0.0/0 | HTTP (Nginx → Next.js) |
| TCP | 443 | 0.0.0.0/0 | HTTPS (미사용, 예약) |

> Security Group ID: `sg-07a5702155f232fb0`

---

## 4. IAM 역할

| 항목 | 값 |
|------|-----|
| **Instance Profile** | `napzzak-ec2-role` |
| **ARN** | `arn:aws:iam::637423378549:instance-profile/napzzak-ec2-role` |

IAM 역할에 연결된 권한:
- Amazon S3 (영상/이미지/JSON 저장)
- Amazon Bedrock (Nova Pro, Nova Lite, Nova Canvas, Nova 2 Sonic)
- Amazon DynamoDB (Job 상태 관리)
- Amazon Transcribe (음성→텍스트)

---

## 5. AWS 리소스

| 서비스 | 리소스명 | 리전 | 용도 |
|--------|---------|------|------|
| **S3** | `napzzak-videos-637423378549` | us-east-1 | 영상, 패널 이미지, story.json 저장 |
| **DynamoDB** | `napzzak-jobs-637423378549` | us-east-1 | Job 상태 관리 (폴링용) |
| **Bedrock** | Nova Pro / Lite / Canvas / Sonic | us-east-1 | AI 분석, 이미지 생성, 음성 |
| **Transcribe** | Streaming API | us-east-1 | 영상 대사 추출 + 화자 분리 |

---

## 6. 서버 구성

```
[Client Browser]
       |
       v  :80
[Nginx Reverse Proxy]
       |
       v  :3000
[Next.js App (PM2)]
       |
       v
[AWS Services (S3, Bedrock, DynamoDB, Transcribe)]
```

### Nginx
- 설정 파일: `/etc/nginx/conf.d/napzzak.conf`
- 리버스 프록시: `:80` → `127.0.0.1:3000`
- `client_max_body_size`: 500MB
- 프록시 타임아웃: 300초

### PM2
- 프로세스 이름: `napzzak`
- 시작 명령: `npm start`
- systemd 자동 시작 등록 완료

### 환경 변수 (.env.local)
```
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=637423378549
S3_BUCKET_NAME=napzzak-videos-637423378549
DYNAMODB_TABLE_NAME=napzzak-jobs-637423378549
```

> AWS 인증은 IAM Instance Profile 사용 (ACCESS_KEY 불필요)

---

## 7. 배포 방법

### 최초 배포
```bash
# 1. 로컬에서 EC2로 프로젝트 전송
scp -i napzzak-key.pem -r ./napzzak ec2-user@54.156.75.146:/home/ec2-user/

# 2. EC2에서 배포 스크립트 실행
ssh -i napzzak-key.pem ec2-user@54.156.75.146
cd /home/ec2-user/napzzak
bash scripts/deploy-ec2.sh
```

배포 스크립트(`scripts/deploy-ec2.sh`)가 설치하는 항목:
1. 시스템 패키지 (git, nginx, gcc-c++, make)
2. Node.js 20 LTS
3. ffmpeg (arm64 static) + yt-dlp
4. PM2 (프로세스 매니저)
5. npm install + npm run build + PM2 시작
6. Nginx 리버스 프록시 설정

### 업데이트 배포
```bash
ssh -i napzzak-key.pem ec2-user@54.156.75.146
cd /home/ec2-user/napzzak
git pull origin main
npm install
npm run build
pm2 restart napzzak
```

---

## 8. 운영 명령어

```bash
# SSH 접속
ssh -i napzzak-key.pem ec2-user@54.156.75.146

# 앱 로그 확인
pm2 logs napzzak

# 앱 재시작
pm2 restart napzzak

# 리소스 모니터링
pm2 monit

# Nginx 상태 확인
sudo systemctl status nginx

# Nginx 설정 테스트 & 재시작
sudo nginx -t && sudo systemctl restart nginx
```

---

## 9. AWS CLI 로컬 조회

```bash
# 인스턴스 상태 확인 (personal 프로필, us-east-1)
aws ec2 describe-instances --profile personal --region us-east-1 \
  --filters "Name=tag:Name,Values=napzzak" \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]' \
  --output table

# 인스턴스 중지
aws ec2 stop-instances --profile personal --region us-east-1 \
  --instance-ids i-02983dbf2e58d87c3

# 인스턴스 시작
aws ec2 start-instances --profile personal --region us-east-1 \
  --instance-ids i-02983dbf2e58d87c3
```

> **주의**: 인스턴스 중지 후 재시작하면 Public IP가 변경됩니다 (Elastic IP 미사용).
