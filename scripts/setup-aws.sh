#!/bin/bash
set -e

export AWS_PROFILE=personal
REGION="us-east-1"

echo "=== Napzzak AWS 리소스 셋업 ==="
echo ""

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ -z "$ACCOUNT_ID" ]; then
  echo "ERROR: AWS 인증 실패. 'aws configure --profile personal' 로 설정하세요."
  exit 1
fi

BUCKET_NAME="napzzak-videos-${ACCOUNT_ID}"

echo "Region:  ${REGION}"
echo "Account: ${ACCOUNT_ID}"
echo "Bucket:  ${BUCKET_NAME}"
echo ""

# 1. S3 버킷 생성
echo "[1/5] S3 버킷 생성 중..."
if aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
  echo "  -> 버킷이 이미 존재합니다."
else
  aws s3api create-bucket \
    --bucket "${BUCKET_NAME}" \
    --region "${REGION}"
  echo "  -> 버킷 생성 완료."
fi

# 2. CORS 설정
echo "[2/5] CORS 설정 중..."
aws s3api put-bucket-cors \
  --bucket "${BUCKET_NAME}" \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST"],
        "AllowedOrigins": ["http://localhost:3000"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
      }
    ]
  }'
echo "  -> CORS 설정 완료."

# 3. DynamoDB 테이블 생성
TABLE_NAME="napzzak-jobs-${ACCOUNT_ID}"
echo "[3/5] DynamoDB 테이블 생성 중..."
if aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${REGION}" 2>/dev/null; then
  echo "  -> 테이블이 이미 존재합니다."
else
  aws dynamodb create-table \
    --table-name "${TABLE_NAME}" \
    --attribute-definitions AttributeName=id,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"
  echo "  -> 테이블 생성 완료."
fi

# 4. 퍼블릭 액세스 차단
echo "[4/5] 퍼블릭 액세스 차단 설정 중..."
aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo "  -> 퍼블릭 액세스 차단 완료."

# 5. .env.local 업데이트
echo "[5/5] .env.local 확인 중..."

echo ""
echo "=== 셋업 완료 ==="
echo ""

# .env.local 파일 자동 생성
ENV_FILE="$(dirname "$0")/../.env.local"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
AWS_REGION=${REGION}
AWS_PROFILE=personal
AWS_ACCOUNT_ID=${ACCOUNT_ID}
S3_BUCKET_NAME=${BUCKET_NAME}
DYNAMODB_TABLE_NAME=${TABLE_NAME}
EOF
  echo ".env.local 파일이 생성되었습니다."
else
  echo ".env.local 파일이 이미 존재합니다. 필요 시 수동으로 업데이트하세요:"
fi

echo ""
echo "  AWS_REGION=${REGION}"
echo "  AWS_ACCOUNT_ID=${ACCOUNT_ID}"
echo "  S3_BUCKET_NAME=${BUCKET_NAME}"
echo "  DYNAMODB_TABLE_NAME=${TABLE_NAME}"
echo ""
echo "다음 단계:"
echo "  1. Bedrock 콘솔에서 Amazon Nova Lite 모델 액세스를 활성화하세요:"
echo "     https://console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess"
echo "  2. npm run dev 로 개발 서버를 시작하세요."
