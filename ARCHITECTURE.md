# 납짝 (Napzzak) - 기술 아키텍처 문서 v6

> 영상을 업로드하면 AI 멀티-패스 분석을 통해 스토리 기반 N컷 만화로 자동 변환하는 서비스

---

## 1. 사용 AI 모델 / 서비스 (5개)

| 모델/서비스 | 모델 ID / 서비스 | 역할 | API 방식 |
|-------------|-----------------|------|----------|
| **Nova 2 Lite** | `us.amazon.nova-2-lite-v1:0` | Pass 1 Step A (대사/오디오 검증) · Step B (행동/인과관계 분석) | Converse API (`ConverseCommand`) |
| **Nova 2 Pro** | `us.amazon.nova-pro-v1:0` | Pass 1 Step C (스토리 종합) · 반박 검증 · Pass 2 (패널 구조 추출) | Converse API (`ConverseCommand`) |
| **Nova Canvas** | `amazon.nova-canvas-v1:0` | 패널별 개별 만화 이미지 생성 + 통합 페이지 생성 | InvokeModel API |
| **Nova 2 Sonic** | `amazon.nova-2-sonic-v1:0` | 만화 패널 대사 음성 내레이션 (on-demand) | Bidirectional Stream API |
| **AWS Transcribe** | Amazon Transcribe | 영상에서 대사 텍스트 추출 (화자 분리 포함) | TranscribeStreamingClient |

> Nova Multimodal Embeddings는 현재 미사용 (프레임 중복 제거는 ffmpeg 기반 키프레임 추출로 대체)

---

## 2. 전체 파이프라인 흐름

```
사용자 → 영상 업로드
         ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 1: Upload & Storage              │
    │  Next.js API (POST /api/upload)         │
    │  → Amazon S3 (videos/{jobId}/original)  │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 2: 전처리                         │
    │                                         │
    │  2-A: AWS Transcribe 대사 추출           │
    │    - 영상에서 오디오 추출                 │
    │    - 화자 분리 (spk_0, spk_1, ...)       │
    │    - 타임스탬프 포함 텍스트 출력           │
    │                                         │
    │  2-B: ffmpeg 키프레임 추출               │
    │    - 0.5초 간격으로 영상 프레임 추출       │
    │    - base64 JPEG로 변환                  │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 3: Pass 1 - 3단계 CoT 심층 분석   │
    │                                         │
    │  Step A: 대사/오디오 검증 (Nova 2 Lite)  │
    │    입력: S3 영상 + Transcribe 결과 + 키프레임 │
    │    출력: 화자 식별 + 대사-화자 매핑 (평문)  │
    │                                         │
    │  Step B: 행동 순서/인과관계 분석 (Nova 2 Lite) │
    │    입력: S3 영상 + 키프레임               │
    │    출력: 인물 간 상호작용 + 인과관계 (평문) │
    │                                         │
    │  Step C: 스토리 종합 (Nova 2 Pro)        │
    │    입력: S3 영상 + Step A + Step B 결과  │
    │    출력: VideoDeepAnalysis JSON          │
    │      - characters (외모/역할)             │
    │      - storyArc (기승전결)               │
    │      - timeline (시간대별 인과관계)        │
    │      - fullStorySummary                  │
    │      - keyMoments                        │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 4: 반박 검증 (Nova 2 Pro)         │
    │    입력: S3 영상 + Step C 분석 결과       │
    │    6가지 반박 질문으로 오류 검증/수정:      │
    │      - 화자 귀속 검증                     │
    │      - 행동 주체 전환 테스트              │
    │      - 인과관계 방향 검증                 │
    │      - 가짜/진짜 행동 구분               │
    │      - 대화-행동 일관성                   │
    │      - 보컬 미미크리 감지                 │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 5: Pass 2 - 만화 패널 구조 추출   │
    │  (Nova 2 Pro)                           │
    │    입력: S3 영상 + 검증된 DeepAnalysis    │
    │    출력: NovaAnalysisResult JSON         │
    │      - characterDescriptions            │
    │      - 4~6개 패널 구조                   │
    │      - climaxIndex                      │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 6: 패널별 이미지 생성              │
    │  Nova Canvas (TEXT_IMAGE) × N패널        │
    │                                         │
    │  각 패널마다:                             │
    │    - 아트 스타일 프리픽스                  │
    │    - characterDescriptions 공통 주입      │
    │    - 스토리 컨텍스트                      │
    │    - 상세 장면 description                │
    │    - negativeText (텍스트/말풍선 차단)     │
    │                                         │
    │  + 통합 만화 페이지 1장 (폴백용)           │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 7: Story JSON 생성 & 저장         │
    │  → S3 영구 저장 (story.json)             │
    │  → DynamoDB Job Store (폴링용)           │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 8: 프론트엔드 렌더링              │
    │                                         │
    │  🖼️ 패널별 모드 (기본):                  │
    │    - 각 패널 이미지를 그리드로 렌더링      │
    │    - 대사는 CSS 오버레이로 정확하게 표시   │
    │    - 감정별 말풍선 색상 분류               │
    │    - EN/KO 언어 토글                     │
    │    - 대사 ON/OFF 토글                    │
    │    - climax 패널 골드 링 강조             │
    │    - panel / page 뷰모드 전환             │
    │                                         │
    │  사용자 선택:                             │
    │  ├─ 🖌️ 그림체 변경 → /api/restyle       │
    │  │   (Nova Canvas 통합 만화 페이지 재생성) │
    │  └─ 🔊 음성 재생 → /api/narrate          │
    └─────────────────────────────────────────┘
                  ↓ (사용자 클릭 시, on-demand)
    ┌─────────────────────────────────────────┐
    │  STAGE 9: 음성 내레이션                  │
    │  Nova 2 Sonic (POST /api/narrate)       │
    │  → 대사 텍스트 → WAV 오디오 → 브라우저 재생│
    └─────────────────────────────────────────┘
```

---

## 3. 프로젝트 구조

```
napzzak/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # 메인 페이지 (업로드 → 처리 → 결과)
│   │   ├── layout.tsx                  # 루트 레이아웃
│   │   └── api/
│   │       ├── upload/route.ts         # 영상 업로드 + AI 파이프라인 시작
│   │       ├── jobs/[jobId]/route.ts   # 작업 상태 폴링 + S3 복원
│   │       ├── narrate/route.ts        # Nova 2 Sonic 음성 내레이션
│   │       ├── restyle/route.ts        # 그림체 변경 (Nova Canvas 패널별 재생성)
│   │       ├── upload-youtube/route.ts # YouTube URL 기반 영상 업로드
│   │       └── analyze-story/route.ts  # 스토리 분석 API
│   ├── lib/
│   │   ├── bedrock.ts                  # Nova 2 Lite/Pro - 멀티패스 영상 분석
│   │   ├── canvas.ts                   # Nova Canvas - 패널별 개별 + 통합 페이지 생성
│   │   ├── transcribe.ts              # AWS Transcribe - 대사 추출 + 화자 분리
│   │   ├── ffmpeg.ts                  # ffmpeg - 키프레임 추출 + 영상 처리
│   │   ├── sonic.ts                   # Nova 2 Sonic - 텍스트→음성
│   │   ├── pipeline.ts               # 파이프라인 오케스트레이션
│   │   ├── s3.ts                      # S3 업로드/다운로드/StoryJSON 저장
│   │   ├── store.ts                   # DynamoDB Job 상태 관리
│   │   ├── dynamodb.ts               # DynamoDB 클라이언트
│   │   └── types.ts                   # TypeScript 타입 정의
│   ├── hooks/
│   │   └── useNarration.ts            # 음성 재생 커스텀 훅
│   └── components/
│       ├── VideoUploader.tsx           # 드래그&드롭 업로드 UI
│       ├── ProcessingStatus.tsx        # 10단계 처리 진행 표시
│       ├── StyleSwitcher.tsx           # 만화 그림체 전환 (4가지 아트 스타일)
│       ├── LanguageToggle.tsx          # 대사 언어 전환 (KO/EN)
│       ├── ComicPageView.tsx           # 패널별 렌더러 + CSS 대사 오버레이 + 음성 재생
│       ├── SpeakerButton.tsx          # 음성 재생 버튼 컴포넌트
│       ├── Mascots.tsx                # 마스코트 캐릭터 (납서/문어, 짝이/너구리)
│       └── NapzzakAnimation.tsx       # 납짝 애니메이션 (처리 대기 화면용)
├── scripts/
│   └── setup-aws.sh                   # AWS 리소스 자동 셋업
├── img/                               # 프로젝트 이미지 리소스
├── solutions.md                       # 기술적 해결 방안 문서
├── .env.local                         # AWS 인증 정보
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 4. Story JSON 스키마 (v6)

```typescript
interface StoryJson {
  videoId: string;
  duration: number;
  summary: string;
  climaxIndex: number;
  panels: Panel[];
  comicPageUrl: string;           // 통합 만화 이미지 (레거시/폴백)
  novaModelsUsed: string[];
  hasAudioDialogue: boolean;
  artStyle: ArtStyle;
  dialogueLanguage: DialogueLanguage;
  characterDescriptions?: string; // 캐릭터 외모 설명 (이미지 생성 일관성용)
  isPanelMode?: boolean;          // 패널별 개별 이미지 모드 여부
  transcribeText?: string;        // AWS Transcribe 전체 대사 추출 결과
}

type ArtStyle =
  | 'GRAPHIC_NOVEL_ILLUSTRATION'
  | 'SOFT_DIGITAL_PAINTING'
  | 'FLAT_VECTOR_ILLUSTRATION'
  | '3D_ANIMATED_FAMILY_FILM';

type DialogueLanguage = 'ko' | 'en';

type ViewMode = 'panel' | 'page';

interface Panel {
  panelId: number;
  description: string;            // 장면 설명 (100-200자, 이미지 생성 프롬프트용)
  emotion: 'joy' | 'sadness' | 'surprise' | 'anger' | 'fear' | 'neutral';
  dialogue?: string;              // 영어 대사 (프론트 CSS 오버레이용)
  dialogueKo?: string;            // 한국어 대사 (프론트 CSS 오버레이용)
  translation?: string;           // 레거시 호환
  transcribedDialogue?: string;   // 영상 원본 대사
  imageUrl?: string;              // 패널별 개별 이미지 URL
}
```

---

## 5. S3 저장 구조

```
videos/{jobId}/
├── original.mp4               # 원본 영상
├── story.json                 # Story JSON (v6)
├── comic-page.png             # 통합 만화 페이지 이미지 (레거시/폴백)
├── panel-1.png                # 패널 1 개별 이미지
├── panel-2.png                # 패널 2 개별 이미지
├── panel-3.png                # ...
├── panel-4.png
├── panel-5.png                # (선택)
└── panel-6.png                # (선택)
```

---

## 6. 사용자 전환 시 재처리 범위

| 사용자 액션 | AWS Transcribe | Nova 2 Lite (Pass 1 A/B) | Nova 2 Pro (Pass 1 C + Verify + Pass 2) | Nova Canvas (패널별) |
|-------------|:--------------:|:------------------------:|:---------------------------------------:|:-------------------:|
| 최초 생성    | O              | O (Step A + Step B)      | O (Step C + Verify + Pass 2)            | O (N패널 + 통합 1장) |
| 그림체 변경  | X              | X                        | X                                       | O (패널별 재생성)     |

---

## 7. 처리 진행 단계 (10단계)

| 단계 | progress 값 | 설명 |
|------|-------------|------|
| 1 | `uploaded` | S3에 영상 업로드 완료 |
| 2 | `transcribing` | AWS Transcribe: 대사 추출 + 화자 분리 |
| 3 | `extracting_frames` | ffmpeg: 0.5초 간격 키프레임 추출 |
| 4 | `analyzing_pass1_stepA` | Nova 2 Lite: 대사/오디오 검증 (화자 식별) |
| 5 | `analyzing_pass1_stepB` | Nova 2 Lite: 행동 순서 + 인과관계 분석 |
| 6 | `analyzing_pass1_stepC` | Nova 2 Pro: 스토리 종합 (기승전결 아크) |
| 7 | `verifying` | Nova 2 Pro: 반박 질문 기반 분석 결과 검증 |
| 8 | `analyzing_pass2` | Nova 2 Pro: 만화 패널 구조 추출 |
| 9 | `generating_panels` | Nova Canvas: 패널별 개별 이미지 생성 (1/N ~ N/N) |
| 10 | `generating_comic` | Nova Canvas: 통합 만화 페이지 생성 (폴백용) |
| - | `completed` | 만화 생성 완료 |

---

## 8. 3단계 Chain-of-Thought 분석 상세

### Step A: 대사/오디오 검증 (Nova 2 Lite)

입력: S3 영상 + AWS Transcribe 결과 + 키프레임

- **화자 인벤토리**: 모든 등장인물 외모 기술
- **오디오 인벤토리**: 모든 소리 분류 (대사/보컬미미크리/비언어음성/환경음)
- **화자-대사 매핑**: 립무브먼트 기반 정확한 화자 귀속
- **보컬 미미크리 감지**: 사람이 소리를 흉내내는 행동 감지

### Step B: 행동 순서/인과관계 분석 (Nova 2 Lite)

입력: S3 영상 + 키프레임

- **상호작용 타임라인**: 인물 간 상호작용 인과관계 시간순 기록
- **시작자 vs 반응자**: 행동 주체와 반응 주체 정확히 구분
- **가짜/진짜 구분**: 연기나 모방 행동 vs 실제 행동
- **감정 변화 아크**: 각 인물의 감정 변화 추적

### Step C: 종합 (Nova 2 Pro)

입력: S3 영상 + Step A + Step B 결과 + Transcribe 텍스트

- Step A (화자 귀속) + Step B (행동/인과관계) 통합
- **storyArc**: 기승전결 구조로 스토리 아크 정형화
- **품질 검증 게이트**: summary 길이, 대사 수, 캐릭터 외모 검증
- 품질 불합격 시 자동 재시도

### Verification: 반박 검증 (Nova 2 Pro)

Step C 결과를 6가지 반박 질문으로 검증:
1. 화자 귀속 재검증 (립무브먼트 재확인)
2. 행동 주체 전환 테스트 (A→B vs B→A)
3. 인과관계 방향 검증
4. 가짜/진짜 행동 구분
5. 대화-행동 일관성
6. 보컬 미미크리 감지

### Pass 2: 패널 구조 추출 (Nova 2 Pro)

검증된 DeepAnalysis를 컨텍스트로 주입하여:
- **characterDescriptions**: 이미지 생성기용 캐릭터 외모 통합 설명
- **panels**: 4~6개 패널, 각각 100-200자 description + 감정 + 대사(EN/KO)
- **climaxIndex**: 가장 극적인 패널 지정

---

## 9. 대사 렌더링 전략

### 기존 문제
- Nova Canvas TEXT_IMAGE로 말풍선+텍스트를 이미지 내에 생성 시도
- AI 이미지 생성 모델의 고질적 한계로 "hilka", "wralw!" 같은 깨진 텍스트 생성

### 해결: CSS 오버레이 방식
- 이미지에서 텍스트를 **완전 제거** (negativeText 20+ 키워드)
- 대사는 프론트엔드 HTML/CSS `<div>`로 정확하게 렌더링
- 감정별 말풍선 색상: joy=노랑, sadness=파랑, anger=빨강, surprise=오렌지, fear=보라, neutral=흰색
- EN/KO 언어 토글 + 대사 ON/OFF 토글 제공

---

## 10. AWS 리소스

| 서비스 | 리소스 | 용도 |
|--------|--------|------|
| **Amazon S3** | `napzzak-videos-{accountId}` | 영상, 패널 이미지, Story JSON 저장 |
| **Amazon Bedrock** | Nova 2 Lite | 영상 Pass 1 Step A/B 추출 분석 |
| **Amazon Bedrock** | Nova 2 Pro | 영상 Pass 1 Step C + 검증 + Pass 2 패널 기획 |
| **Amazon Bedrock** | Nova Canvas | 패널별 만화 이미지 생성 |
| **Amazon Bedrock** | Nova 2 Sonic | 음성 내레이션 |
| **Amazon Transcribe** | Streaming API | 영상 대사 추출 + 화자 분리 |
| **Amazon DynamoDB** | `napzzak-jobs-{accountId}` | Job 상태 관리 |

---

## 11. 기술 스택

| 카테고리 | 기술 |
|----------|------|
| **프레임워크** | Next.js 16 (App Router) |
| **언어** | TypeScript |
| **스타일링** | Tailwind CSS |
| **AI (분석)** | Amazon Bedrock Nova 2 Lite + Nova 2 Pro (3단계 CoT) |
| **AI (이미지)** | Amazon Bedrock Nova Canvas |
| **AI (음성)** | Amazon Bedrock Nova 2 Sonic |
| **음성 인식** | Amazon Transcribe (Streaming) |
| **영상 처리** | ffmpeg (키프레임 추출) |
| **스토리지** | Amazon S3 |
| **DB** | Amazon DynamoDB |
| **패키지 관리** | npm |

---

## 12. 차별화 포인트

1. **Amazon Nova 듀얼 모델** - Nova 2 Lite(빠른 추출) + Nova 2 Pro(고급 추론) 역할 분리
2. **3단계 Chain-of-Thought 분석** - Step A(대사) → Step B(행동) → Step C(종합) 순차 분석
3. **반박 검증 게이트** - 6가지 adversarial 질문으로 분석 오류 자동 교정
4. **AWS Transcribe 통합** - 화자 분리된 정확한 대사 텍스트를 AI 분석에 주입
5. **ffmpeg 키프레임 추출** - 0.5초 간격 프레임으로 시각 정보 강화
6. **CSS 대사 오버레이** - AI 텍스트 렌더링 한계를 구조적으로 해결
7. **4가지 그림체** - Graphic Novel / Soft Painting / Flat Vector / 3D Animation
8. **이중 언어 대사** - 한국어↔영어 대사 지원 + ON/OFF 토글
9. **2가지 뷰모드** - panel(패널별 그리드) / page(단일 페이지) 레이아웃
10. **영구 저장** - S3 + DynamoDB 기반, 재방문 시 즉시 로드
11. **음성 내레이션** - Nova 2 Sonic으로 대사 음성 재생 (on-demand)
12. **마스코트 캐릭터** - 납서(문어) + 짝이(너구리) 납짝 애니메이션

---

## 13. Nova API 호출 횟수

| 단계 | 모델/서비스 | 호출 수 | 비고 |
|------|------------|---------|------|
| 대사 추출 | AWS Transcribe | 1회 | 스트리밍 API |
| 키프레임 추출 | ffmpeg | - | 로컬 처리 |
| Step A (대사 검증) | Nova 2 Lite | 1회 | 화자 식별 |
| Step B (행동 분석) | Nova 2 Lite | 1회 | 인과관계 |
| Step C (종합) | Nova 2 Pro | 1~2회 | 품질 검증 재시도 포함 |
| 반박 검증 | Nova 2 Pro | 1회 | Adversarial |
| Pass 2 (패널 기획) | Nova 2 Pro | 1~3회 | 재시도 포함 |
| 패널별 이미지 | Nova Canvas | 4~6회 | 패널 수만큼 |
| 통합 페이지 | Nova Canvas | 1회 | 레거시/폴백 |
| 음성 내레이션 | Nova 2 Sonic | on-demand | 사용자 요청 시 |
| **최초 생성 총합** | | **11~16회** | |
| **그림체 변경** | Nova Canvas | 5~7회 | 패널 재생성만 |
