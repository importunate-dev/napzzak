# 냅짝 (Napzzak) - 기술 아키텍처 문서 v5

> 영상을 업로드하면 AI 2-Pass 분석을 통해 스토리 기반 N컷 만화로 자동 변환하는 서비스

---

## 1. 사용 Amazon Nova 모델 (4개)

| 모델 | 모델 ID | 역할 | API 방식 |
|------|---------|------|----------|
| **Nova 2 Lite** | `us.amazon.nova-2-lite-v1:0` | 영상 2-Pass 분석 · 캐릭터/대사/스토리 추출 · 패널 구조 설계 | Converse API (`ConverseCommand`) |
| **Nova Canvas** | `amazon.nova-canvas-v1:0` | 패널별 개별 만화 이미지 생성 (TEXT_IMAGE) + 통합 페이지 생성 | InvokeModel API |
| **Nova 2 Sonic** | `amazon.nova-2-sonic-v1:0` | 만화 패널 대사 음성 내레이션 | Bidirectional Stream API |
| **Nova Multimodal Embeddings** | `amazon.nova-2-multimodal-embeddings-v1:0` | 프레임 중복 제거 (코사인 유사도) | InvokeModel API |

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
    │  STAGE 2-A: 영상 심층 분석 (Pass 1)      │
    │  Nova 2 Lite (Converse API)             │
    │                                         │
    │  입력: S3 영상 (오디오+비주얼 동시 분석)   │
    │  출력:                                   │
    │    - 등장인물 상세 외모 기술              │
    │    - 실제 대사 원문 추출                  │
    │    - 전체 타임라인 (시간대별 상황)         │
    │    - 장르/형식 판별                       │
    │    - 핵심 갈등/반전/유머 포인트            │
    │    - 종합 스토리 요약                     │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 2-B: 만화 패널 구조 추출 (Pass 2)  │
    │  Nova 2 Lite (Converse API)             │
    │                                         │
    │  입력: S3 영상 + Pass 1 분석 결과 주입    │
    │  출력:                                   │
    │    - characterDescriptions (이미지 생성용) │
    │    - 4~6개 패널 구조:                     │
    │      · description (100-200자 상세)       │
    │      · emotion (감정 분류)                │
    │      · dialogue (영어 대사)               │
    │      · dialogueKo (한국어 대사)           │
    │    - climaxIndex (클라이맥스 패널)         │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 3: 패널별 이미지 생성              │
    │  Nova Canvas (TEXT_IMAGE) × N패널        │
    │                                         │
    │  각 패널마다:                             │
    │    - 아트 스타일 프리픽스                  │
    │    - characterDescriptions 공통 주입      │
    │    - 스토리 컨텍스트                      │
    │    - 상세 장면 description                │
    │    - 강화된 negativeText                  │
    │      (text, speech bubbles, letters 등    │
    │       20+ 키워드로 텍스트 생성 차단)       │
    │                                         │
    │  + 통합 만화 페이지 1장 (폴백용)           │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 4: Story JSON 생성 & 저장         │
    │  → S3 영구 저장 (서버 재시작 후에도 유지)  │
    │  → DynamoDB Job Store (폴링용)           │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 5: 프론트엔드 렌더링              │
    │                                         │
    │  🖼️ 패널별 모드 (기본):                  │
    │    - 각 패널 이미지를 그리드로 렌더링      │
    │    - 대사는 CSS 오버레이로 정확하게 표시   │
    │    - 감정별 말풍선 색상 분류               │
    │    - EN/KO 언어 토글                     │
    │    - 대사 ON/OFF 토글                    │
    │    - climax 패널 골드 링 강조             │
    │                                         │
    │  📄 단일 페이지 모드 (레거시):             │
    │    - 통합 comic-page.png 표시             │
    │                                         │
    │  사용자 선택:                             │
    │  ├─ 🖌️ 그림체 변경 → /api/restyle       │
    │  │   (Nova Canvas 패널별 재생성)          │
    │  └─ 🔊 음성 재생 → /api/narrate          │
    └─────────────────────────────────────────┘
                  ↓ (사용자 클릭 시, on-demand)
    ┌─────────────────────────────────────────┐
    │  STAGE 6: 음성 내레이션                  │
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
│   │       ├── upload/route.ts         # 영상 업로드 + AI 파이프라인
│   │       ├── jobs/[jobId]/route.ts   # 작업 상태 폴링 + S3 복원
│   │       ├── narrate/route.ts        # Nova 2 Sonic 음성 내레이션
│   │       └── restyle/route.ts        # 그림체 변경 (Nova Canvas 패널별 재생성)
│   ├── lib/
│   │   ├── bedrock.ts                  # Nova 2 Lite - 2-Pass 영상 분석
│   │   ├── canvas.ts                   # Nova Canvas - 패널별 개별 + 통합 페이지 생성
│   │   ├── embeddings.ts              # Nova Multimodal Embeddings - 프레임 중복 제거
│   │   ├── sonic.ts                   # Nova 2 Sonic - 텍스트→음성
│   │   ├── pipeline.ts               # 파이프라인 오케스트레이션
│   │   ├── s3.ts                      # S3 업로드/다운로드/StoryJSON 저장
│   │   ├── store.ts                   # DynamoDB Job 상태 관리
│   │   └── types.ts                   # TypeScript 타입 정의
│   ├── hooks/
│   │   └── useNarration.ts            # 음성 재생 커스텀 훅
│   └── components/
│       ├── VideoUploader.tsx           # 드래그&드롭 업로드 UI
│       ├── ProcessingStatus.tsx        # 6단계 처리 진행 표시
│       ├── StyleSwitcher.tsx           # 만화 그림체 전환 (4가지 아트 스타일)
│       ├── LanguageToggle.tsx          # 대사 언어 전환 (KO/EN)
│       ├── ComicPageView.tsx           # 패널별 렌더러 + CSS 대사 오버레이
│       └── SpeakerButton.tsx          # 음성 재생 버튼 컴포넌트
├── scripts/
│   └── setup-aws.sh                   # AWS 리소스 자동 셋업
├── .env.local                         # AWS 인증 정보
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 4. Story JSON 스키마 (v5)

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
}

type ArtStyle =
  | 'GRAPHIC_NOVEL_ILLUSTRATION'
  | 'SOFT_DIGITAL_PAINTING'
  | 'FLAT_VECTOR_ILLUSTRATION'
  | '3D_ANIMATED_FAMILY_FILM';

type DialogueLanguage = 'ko' | 'en';

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
├── story.json                 # Story JSON (v5)
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

| 사용자 액션 | Nova 2 Lite (2-Pass) | Nova Canvas (패널별) |
|-------------|:--------------------:|:-------------------:|
| 최초 생성    | O (Pass 1 + Pass 2)  | O (N패널 + 통합 1장) |
| 그림체 변경  | X                    | O (패널별 재생성)     |

---

## 7. 처리 진행 단계

| 단계 | progress 값 | 설명 |
|------|-------------|------|
| 1 | `uploaded` | S3에 영상 업로드 완료 |
| 2 | `analyzing_pass1` | Nova 2 Lite Pass 1: 스토리/캐릭터/대사 심층 분석 |
| 3 | `analyzing_pass2` | Nova 2 Lite Pass 2: 만화 패널 구조 추출 |
| 4 | `generating_panels` | Nova Canvas: 패널별 개별 이미지 생성 (1/N ~ N/N) |
| 5 | `generating_comic` | Nova Canvas: 통합 만화 페이지 생성 (폴백용) |
| 6 | `completed` | 만화 생성 완료 |

---

## 8. 2-Pass 분석 상세

### Pass 1: 영상 심층 분석

Nova 2 Lite에 영상을 보내며 다음을 추출합니다:

- **characters**: 등장인물별 이름(또는 라벨), 상세 외모 (머리색/스타일, 복장, 체형, 특징), 역할
- **timeline**: 시간대별 상황, 화자, 실제 대사 원문
- **fullStorySummary**: 오디오+비주얼을 종합한 전체 스토리 설명
- **keyMoments**: 핵심 갈등/반전/유머 포인트
- **genre**: 영상 장르 (시트콤, 브이로그, 뉴스, 드라마 등)

### Pass 2: 패널 구조 추출

Pass 1 결과를 컨텍스트로 주입하여, 동일 영상을 다시 보면서:

- **characterDescriptions**: 이미지 생성기에 전달할 캐릭터 외모 통합 설명
- **panels**: 4~6개 패널, 각각 100-200자 description + 감정 + 대사(EN/KO)
- **climaxIndex**: 가장 극적인 패널 지정

이 2-Pass 방식은 기존 1-Pass 대비:
- 스토리 파악 정확도 대폭 향상 (대사를 듣고 나서 패널을 구성)
- 캐릭터 외모 일관성 확보 (모든 패널에 동일 외모 정보 주입)
- description 품질 향상 (맥락을 이해한 상태에서 장면 기술)

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
| **Amazon Bedrock** | Nova 2 Lite | 영상 2-Pass 분석 |
| **Amazon Bedrock** | Nova Canvas | 패널별 만화 이미지 생성 |
| **Amazon Bedrock** | Nova 2 Sonic | 음성 내레이션 |
| **Amazon Bedrock** | Nova Multimodal Embeddings | 프레임 중복 제거 |
| **Amazon DynamoDB** | `napzzak-jobs-{accountId}` | Job 상태 관리 |

---

## 11. 기술 스택

| 카테고리 | 기술 |
|----------|------|
| **프레임워크** | Next.js 16 (App Router) |
| **언어** | TypeScript |
| **스타일링** | Tailwind CSS |
| **AI** | Amazon Bedrock (Nova 2 Lite, Canvas, Sonic, Embeddings) |
| **스토리지** | Amazon S3 |
| **DB** | Amazon DynamoDB |
| **패키지 관리** | npm |

---

## 12. 해커톤 차별화 포인트

1. **Amazon Nova 생태계 4중 활용** - 4개 모델을 파이프라인으로 연결 (분석/생성/음성/임베딩)
2. **2-Pass 심층 분석** - 오디오+비주얼 종합 이해 후 패널 구조 설계
3. **패널별 개별 이미지 생성** - 캐릭터 일관성 유지 + 각 패널 고품질
4. **CSS 대사 오버레이** - AI 텍스트 렌더링 한계를 구조적으로 해결
5. **4가지 그림체** - Graphic Novel / Soft Painting / Flat Vector / 3D Animation
6. **이중 언어 대사** - 한국어↔영어 대사 지원 + ON/OFF 토글
7. **음성 내레이션** - Nova 2 Sonic 통합
8. **영구 저장** - S3 + DynamoDB 기반, 재방문 시 즉시 로드

---

## 13. Nova API 호출 횟수

| 단계 | 모델 | 호출 수 | 비고 |
|------|------|---------|------|
| 심층 분석 (Pass 1) | Nova 2 Lite | 1회 | 영상 전체 분석 |
| 패널 구조 (Pass 2) | Nova 2 Lite | 1회 | Pass 1 결과 주입 |
| 패널별 이미지 | Nova Canvas | 4~6회 | 패널 수만큼 |
| 통합 페이지 | Nova Canvas | 1회 | 레거시/폴백 |
| 음성 내레이션 | Nova 2 Sonic | on-demand | 사용자 요청 시 |
| **최초 생성 총합** | | **7~9회** | |
| **그림체 변경** | Nova Canvas | 5~7회 | 패널 재생성만 |