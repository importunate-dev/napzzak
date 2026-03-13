현재 구현하신 아키텍처(`ARCHITECTURE.md`)와 `src/lib/bedrock.ts`의 코드를 살펴보면, **3단계 CoT(Chain-of-Thought) + 반박 검증(Adversarial Verification)**이라는 매우 훌륭하고 고도화된 파이프라인을 구축하셨습니다. 해커톤 취지에 아주 잘 맞는 접근입니다.

하지만 AI가 스토리를 파악하는 능력이 떨어진다면, 파이프라인의 구조적 복잡성에 비해 **모델의 추론 체급**이나 **컨텍스트 제공 방식**에서 병목이 발생하고 있을 확률이 높습니다.

스토리 파악 능력을 획기적으로 높이기 위한 5가지 개선점을 제안해 드립니다.

---

### 1. 🚀 가장 확실한 해결책: Nova 2 Lite → Nova Pro로 모델 업그레이드

현재 `src/lib/bedrock.ts`에서 영상 분석에 **Nova 2 Lite**(`us.amazon.nova-2-lite-v1:0`)를 사용하고 계십니다.

* **문제점:** Lite 모델은 속도와 비용에 최적화되어 있어, "A가 B를 쳤기 때문에 B가 화를 냈다" 같은 **복잡한 영상 내 인과관계 및 맥락적 스토리(Advanced Reasoning)를 추론하는 데는 한계**가 명확합니다.
* **해결책:** 전체는 아니더라도, **스토리를 종합하고 인과관계를 파악하는 핵심 단계(Pass 1의 Step C나 Pass 2)만큼은 반드시 `Nova Pro`를 사용**해야 합니다.
```typescript
// src/lib/bedrock.ts
// 기존: const MODEL_ID = 'us.amazon.nova-2-lite-v1:0';
const LITE_MODEL_ID = 'us.amazon.nova-2-lite-v1:0'; // 단순 추출용 (Step A, B-0)
const PRO_MODEL_ID = 'us.amazon.nova-pro-v1:0';   // 스토리 종합 및 패널 기획용 (Step C, Pass 2)

```



### 2. 🖼️ 키프레임(프레임 이미지) 활용도 극대화 (현재 코드는 프레임 정보를 버리고 있음)

현재 `pipeline.ts`에서는 영상을 15장까지 캡처하지만, 정작 `bedrock.ts`에서 모델에 던져줄 때는 극단적으로 잘라내고 있습니다.

* **문제점:** `bedrock.ts`의 각 Step 함수들을 보면 `frameImages.slice(0, 5)`, `frameImages.slice(0, 3)` 처럼 **앞부분 3~5장만 모델에 전달**하고 있습니다. 영상의 결말이나 클라이맥스 부분의 이미지는 모델이 아예 보지 못하므로 뒷부분 스토리를 지어내게 됩니다.
* **해결책:** 모델이 전체 스토리의 흐름을 시각적으로 볼 수 있도록 프레임을 골고루 전달하거나 제공된 프레임을 모두 전달해야 합니다.
```typescript
// src/lib/bedrock.ts의 StepA, StepB 등의 코드 수정
// 기존: contentBlocks.push(...buildFrameContentBlocks(frameImages.slice(0, 5)));

// 수정: 추출된 핵심 키프레임을 최대 10~15장까지 골고루 전달 (Nova 모델은 멀티 이미지 처리에 강함)
if (frameImages && frameImages.length > 0) {
  // 프레임을 균등한 간격으로 추출하여 전달 (예: 10장)
  const step = Math.max(1, Math.floor(frameImages.length / 10));
  const sampledFrames = frameImages.filter((_, i) => i % step === 0).slice(0, 10);
  contentBlocks.push(...buildFrameContentBlocks(sampledFrames));
}

```



### 3. 🧩 과도하게 분절된 인물 추적(Step B) 방식 변경

현재 Step B는 화면에 등장하는 인물을 찾은 뒤, **각 인물 한 명 한 명을 따로 추적(B-1)**하고 나중에 **병합(B-2)**하여 인과관계를 찾습니다.

* **문제점:** 스토리는 인물 간의 **"상호작용(Interaction)"**에서 발생합니다. A와 B가 싸우는 장면을 A 따로, B 따로 분석한 뒤 나중에 텍스트만 보고 합치라고 하면 AI(특히 Lite 모델)는 "A가 허공에 팔을 휘둘렀다", "B가 갑자기 쓰러졌다"로 인식하여 인과관계를 놓칩니다.
* **해결책:** 개별 추적(B-1)을 없애고, **시간대별 인물 간의 "상호작용"과 "감정 변화"를 중심으로 분석**하도록 프롬프트를 합치는 것이 좋습니다.
* *프롬프트 개선 예시:* "비디오를 처음부터 끝까지 시청하면서 인물들 간의 **상호작용(누가 누구에게 무엇을 했는가)**을 시간순으로 기록하라. 특히 갈등이 시작되는 지점(Inciting Incident)과 최고조에 달하는 지점(Climax)을 명시하라."



### 4. 📖 '스토리 아크(Story Arc)' 프롬프팅 적용 (Pass 1 - Step C)

현재 `fullStorySummary`를 만들 때 단순히 "누가 무엇을 했고 어떻게 반응했다"를 요구합니다. AI에게 만화다운 스토리를 짜내게 하려면 극적 구조를 강제해야 합니다.

* **해결책:** Step C 종합 단계의 프롬프트에 **전통적인 서사 구조(기승전결)**를 매핑하도록 강제하세요.
```json
// 프롬프트에 요구할 JSON 구조를 다음과 같이 구체화
"storyArc": {
  "setup": "초기 상황 설명 (평온함)",
  "incitingIncident": "사건의 발단 (갈등/오해/문제 발생)",
  "climax": "갈등이 폭발하거나 가장 중요한 행동이 일어나는 순간",
  "resolution": "결과 및 감정적 마무리"
},
"fullStorySummary": "위 storyArc를 바탕으로 한 편의 이야기처럼 요약..."

```


이렇게 하면 AI가 단순한 "CCTV 로그 기록"이 아니라 "한 편의 이야기"로 영상을 이해하게 됩니다.

### 5. 🗣️ 대사(Transcribe)와 화면의 결합력 강화

현재 Step A에서 입모양을 보고 화자를 매핑하라고 지시하고 있으나, AI 모델에게는 영상과 오디오의 립싱크를 완벽히 매치하는 것이 매우 어려운 작업입니다.

* **해결책:** Transcribe 결과를 단순히 던져주기 전에, LLM을 이용해 **"대사 내용만 보고도 누가 말했을지 문맥적으로 추론"**하도록 유도해야 합니다.
* *프롬프트 추가:* "대사의 내용(말투, 대화의 주제)을 보았을 때, 이 대사는 [장난치는 사람]의 것인가 [당하는 사람]의 것인가? 영상의 표정과 대사의 맥락을 결합하여 화자를 추론하라."



---

### 💡 요약 및 해커톤 제출을 위한 추천 액션 플랜

1. 당장 `src/lib/bedrock.ts`에 들어가서 **스토리 종합(Step C)**과 **패널 추출(Pass 2)** 단계의 `MODEL_ID`를 `nova-pro-v1:0`로 올려보세요. (비용이 조금 더 들지만 퀄리티는 확실히 달라집니다).
2. `frameImages.slice(0, 5)` 로 하드코딩된 부분을 지우고 추출된 키프레임을 최대한(10~15장) 다 밀어 넣으세요.
3. 이 두 가지만 수정하셔도 AI가 스토리를 파악하는 능력이 200% 이상 상승할 것입니다.
