# 냅짝 (Napzzak) - 기술 아키텍처 문서

> 영상을 업로드하면 AI 분석을 통해 스토리 기반 단일 만화 페이지로 자동 변환하는 서비스

---

## 1. 사용 Amazon Nova 모델 (3개)

| 모델 | 모델 ID | 역할 | API 방식 |
|------|---------|------|----------|
| **Nova 2 Lite** | `us.amazon.nova-2-lite-v1:0` | 영상 분석 · 전체 스토리 파악 · 4~6 패널 구조 추출 (한국어+영어) | Converse API (`ConverseCommand`) |
| **Nova Canvas** | `amazon.nova-canvas-v1:0` | 프롬프트 → 단일 만화 페이지 이미지 생성 (TEXT_IMAGE) | InvokeModel API |
| **Nova 2 Sonic** | `amazon.nova-2-sonic-v1:0` | 만화 패널 대사 음성 내레이션 | Bidirectional Stream API |

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
    │  STAGE 2: AI 분석 파이프라인             │
    │                                         │
    │  ① Nova 2 Lite (Converse API)           │
    │     - S3 영상 직접 분석                  │
    │     - 전체 스토리 종합 파악              │
    │     - 4~6개 패널 구조 추출 (description, dialogue, emotion) │
    │                                         │
    │  ② Nova Canvas (TEXT_IMAGE)             │
    │     - 전체 스토리 프롬프트로 단일 이미지 생성 │
    │     - 2x2 또는 2x3 그리드 레이아웃       │
    │     - 말풍선 포함 한 번에 생성           │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 3: Story JSON 생성 & 저장         │
    │  → S3 영구 저장 (서버 재시작 후에도 유지)  │
    │  → 인메모리 Job Store (폴링용)            │
    └─────────────┬───────────────────────────┘
                  ↓
    ┌─────────────────────────────────────────┐
    │  STAGE 4: 프론트엔드 렌더링              │
    │                                         │
    │  📄 단일 만화 페이지 (comic-page.png)    │
    │                                         │
    │  사용자 선택:                             │
    │  ├─ 🖌️ 그림체 변경 → /api/restyle       │
    │  │   (Nova Canvas 단일 이미지 재생성)     │
    │  └─ 🔊 음성 재생 → /api/narrate          │
    └─────────────────────────────────────────┘
                  ↓ (사용자 클릭 시, on-demand)
    ┌─────────────────────────────────────────┐
    │  STAGE 5: 음성 내레이션                  │
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
│   │       └── restyle/route.ts        # 그림체 변경 (Nova Canvas 재생성)
│   ├── lib/
│   │   ├── bedrock.ts                  # Nova 2 Lite - 영상 분석 (전체 스토리 + 4~6 패널)
│   │   ├── canvas.ts                   # Nova Canvas - 단일 만화 페이지 생성 (TEXT_IMAGE)
│   │   ├── sonic.ts                   # Nova 2 Sonic - 텍스트→음성
│   │   ├── s3.ts                      # S3 업로드/다운로드/StoryJSON 저장
│   │   ├── store.ts                   # 인메모리 Job 상태 관리
│   │   └── types.ts                   # TypeScript 타입 정의
│   ├── hooks/
│   │   └── useNarration.ts            # 음성 재생 커스텀 훅
│   └── components/
│       ├── VideoUploader.tsx           # 드래그&드롭 업로드 UI
│       ├── ProcessingStatus.tsx        # 처리 단계 진행 표시
│       ├── StyleSwitcher.tsx           # 만화 그림체 전환 (4가지 아트 스타일)
│       ├── LanguageToggle.tsx          # 대사 언어 전환 (KO/EN)
│       ├── ComicPageView.tsx           # 단일 만화 페이지 렌더러
│       └── SpeakerButton.tsx          # 음성 재생 버튼 컴포넌트
├── .env.local                         # AWS 인증 정보
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 4. Story JSON 스키마 (v4)

```typescript
interface StoryJson {
  videoId: string;
  duration: number;
  summary: string;
  climaxIndex: number;
  panels: Panel[];
  comicPageUrl: string;    // 단일 만화 이미지 (필수)
  novaModelsUsed: string[];
  hasAudioDialogue: boolean;
  artStyle: ArtStyle;
  dialogueLanguage: DialogueLanguage;
}

type ArtStyle =
  | 'GRAPHIC_NOVEL_ILLUSTRATION'
  | 'SOFT_DIGITAL_PAINTING'
  | 'FLAT_VECTOR_ILLUSTRATION'
  | '3D_ANIMATED_FAMILY_FILM';

type DialogueLanguage = 'ko' | 'en';

interface Panel {
  panelId: number;
  dialogue: string;            // 영어 만화 대사
  translation?: string;        // 한국어 번역 (dialogueLanguage=ko일 때)
  description: string;         // 장면 설명 (이미지 생성 프롬프트용)
  emotion: 'joy' | 'sadness' | 'surprise' | 'anger' | 'fear' | 'neutral';
  transcribedDialogue?: string;  // 영상에서 추출한 실제 대사
}
```

---

## 5. S3 저장 구조

```
videos/{jobId}/
├── original.mp4               # 원본 영상
├── story.json                 # Story JSON
└── comic-page.png             # 단일 만화 페이지 이미지
```

---

## 6. 사용자 전환 시 재처리 범위

| 사용자 액션 | Nova 2 Lite | Nova Canvas |
|-------------|:-----------:|:-----------:|
| 최초 생성    | O           | O           |
| 그림체 변경  | X           | O (재생성)   |

---

## 7. AWS 리소스

| 서비스 | 리소스 | 용도 |
|--------|--------|------|
| **Amazon S3** | `napzzak-videos-{accountId}` | 영상, 만화 이미지, Story JSON 저장 |
| **Amazon Bedrock** | Nova 2 Lite (Foundation Model) | 영상 분석 |
| **Amazon Bedrock** | Nova Canvas (Foundation Model) | 만화 이미지 생성 |
| **Amazon Bedrock** | Nova 2 Sonic (Foundation Model) | 음성 내레이션 |

---

## 8. 기술 스택

| 카테고리 | 기술 |
|----------|------|
| **프레임워크** | Next.js 16 (App Router) |
| **언어** | TypeScript |
| **스타일링** | Tailwind CSS |
| **AI** | Amazon Bedrock (Nova 2 Lite, Canvas, Sonic) |
| **스토리지** | Amazon S3 |
| **패키지 관리** | npm |

---

## 9. 해커톤 차별화 포인트

1. **Amazon Nova 생태계 3중 활용** - 3개 모델을 파이프라인으로 연결
2. **전체 스토리 기반** - 단일 프레임이 아닌 전체 영상을 종합 분석해 하나의 만화로 생성
3. **단일 페이지 만화** - 한 페이지에 4~6 패널을 담은 하나의 이미지
4. **AI 이미지 생성** - 텍스트 프롬프트로 만화 스타일 이미지 생성 (TEXT_IMAGE)
5. **4가지 그림체** - Graphic Novel / Watercolor / Flat Vector / 3D Animation
6. **이중 언어 대사** - 한국어↔영어 대사 지원
7. **음성 내레이션** - 만화 패널을 읽어주는 Nova 2 Sonic 통합
8. **영구 저장** - S3 기반으로 분석 결과를 보존, 재방문 시 즉시 로드
