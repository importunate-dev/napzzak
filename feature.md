# 1. 🎯 프로젝트 개요
# https://www.youtube.com/shorts/hMhE7KvzZ8s
## 🔹 목표

영상을 업로드하면 AI **3단계 CoT(Chain-of-Thought) 분석** + 반박 검증을 통해 **스토리 기반 N컷 만화로 자동 변환**하는 서비스 구현

## 🔹 핵심 전략

* 실시간 스트리밍 ❌
* **업로드 기반 처리 ⭕**
* YouTube 링크 입력은 Beta 단계

## 🔹 최종 결과물

하나의 영상 → 3단계 CoT 분석(Step A/B/C) + 반박 검증 → Story JSON → 패널별 이미지 + CSS 대사 오버레이 + 음성 내레이션

---

# 2. 🧠 전체 시스템 아키텍처

## 🔹 High-Level Architecture

영상 업로드 → S3 저장 → Nova Pro Step A/B (추출 분석) → Nova Pro Step C (스토리 종합) → Nova Pro 반박 검증 → Nova Pro Pass 2 (패널 구조) → Nova Canvas (패널별 이미지) → Story JSON → 프론트엔드 렌더링 + Nova 2 Sonic (음성 내레이션, on-demand)

---

# 3. 🔄 오케스트레이션 구조

## 🔹 핵심 원칙

* AI 분석은 **3단계 CoT + 반박 검증** (Step A/B 추출 → Step C 종합 → 반박 검증 → Pass 2 패널 구조)
* 이미지 생성은 **패널별 개별** (캐릭터 일관성 + 고품질)
* 대사는 **CSS 오버레이** (AI 텍스트 렌더링 한계 해결)
* Story JSON을 중심으로 모든 뷰가 동작
* View는 프론트에서 처리

## 🔹 상세 처리 흐름

1. 영상 → S3 업로드
2. AWS Transcribe: 대사 추출 + 화자 분리
3. ffmpeg: 0.5초 간격 키프레임 추출
4. Nova Pro Step A: 대사/오디오 검증 (화자 식별)
5. Nova Pro Step B: 행동 순서 + 인과관계 분석
6. Nova Pro Step C: Step A + Step B 결과를 종합하여 스토리 아크 생성
7. Nova Pro 반박 검증: 6가지 adversarial 질문으로 분석 오류 교정
8. Nova Pro Pass 2: 검증된 분석으로 4~6 패널 구조 + characterDescriptions 추출
9. Nova Canvas × N: 각 패널 개별 이미지 생성 (characterDescriptions 공통 주입)
10. Nova Canvas × 1: 통합 만화 페이지 생성 (폴백)
11. Story JSON 생성 → S3 + DynamoDB 저장
12. 프론트엔드: 패널 그리드 + CSS 대사 오버레이 + 음성 내레이션(on-demand) 렌더링

---

# 4. 📦 Story JSON 구조 설계 (v5)

## 🔹 핵심 데이터 모델

```json
{
  "videoId": "uuid",
  "duration": 180,
  "summary": "Story summary in English",
  "climaxIndex": 2,
  "characterDescriptions": "Woman with auburn hair in brown V-neck; Man with glasses in red shirt",
  "isPanelMode": true,
  "panels": [
    {
      "panelId": 1,
      "description": "Auburn-haired woman in brown top looking surprised, turning around in kitchen with cheesecake on counter",
      "emotion": "surprise",
      "dialogue": "Are you eating the cheesecake alone?",
      "dialogueKo": "너 혼자 치즈케이크 먹고 있는 거야?",
      "imageUrl": "https://s3.../panel-1.png"
    }
  ],
  "comicPageUrl": "https://s3.../comic-page.png",
  "artStyle": "GRAPHIC_NOVEL_ILLUSTRATION",
  "dialogueLanguage": "en"
}
```

## 🔹 필수 필드 설명

| 필드 | 역할 |
| --- | --- |
| **emotion** | 감정별 말풍선 색상 + 메이슨리 강조 기준 |
| **climaxIndex** | 스토리 피크 강조 (골드 링 배지) |
| **characterDescriptions** | 패널별 이미지 생성 시 캐릭터 일관성 유지 |
| **dialogue / dialogueKo** | CSS 오버레이로 정확한 대사 렌더링 |
| **imageUrl** | 패널별 개별 이미지 URL |
| **isPanelMode** | 패널별 / 통합 페이지 뷰 모드 판별 |

---

# 5. 🖼️ 렌더링 전략

## 5-1. 🖼️ Panel Grid Mode (기본 모드)

* **특징:** 패널별 개별 이미지를 2x2 또는 2x3 그리드로 배치, CSS 대사 오버레이, 감정별 말풍선 색상
* **흐름:** StoryJSON → PanelGrid → CSS DialogueBubble 오버레이
* **기능:** 대사 ON/OFF 토글, EN/KO 언어 전환, climax 강조

## 5-2. 📄 Single Page Mode (레거시)

* **특징:** 통합 만화 이미지 한 장 표시 (comic-page.png)
* **흐름:** StoryJSON → comicPageUrl → 이미지 렌더링
* **용도:** 폴백, SNS 공유용

---

# 6. 🧑‍💻 프론트엔드 역할 정리

## 🔹 1. 업로드 UX 설계

* Drag & Drop
* 업로드 진행률
* 6단계 처리 상태 Polling

## 🔹 2. Comic Panel Renderer

* **PanelCard:** 패널 이미지 + CSS 대사 오버레이
* **DialogueBubble:** 감정별 색상 (joy=노랑, sadness=파랑, anger=빨강 등)
* **뷰 전환:** 패널별 / 단일 페이지 토글

## 🔹 3. 대사 컨트롤

* **언어 토글:** EN ↔ KO
* **표시 토글:** 대사 ON / OFF
* 이미지에 텍스트를 넣지 않으므로 깨진 텍스트 문제 없음

## 🔹 4. 상태 관리

* 10단계 progress: uploaded → transcribing → extracting_frames → analyzing_pass1_stepA → analyzing_pass1_stepB → analyzing_pass1_stepC → verifying → analyzing_pass2 → generating_panels → generating_comic → completed
* DynamoDB 기반 Job 상태

---

# 7. 🧱 확장 전략

* **Phase 1 (Hackathon 제출용):** 영상 업로드 → 2-Pass 분석 → 패널별 이미지 → CSS 오버레이 렌더링
* **Phase 2 (Beta):** YouTube 링크 입력 → 클라우드 영상 추출 → 자동 변환
* **Phase 3:** SNS 공유, PDF 만화 변환, 브랜드 템플릿 기능

---

# 8. 🔥 차별화 포인트

1. **3단계 CoT 심층 분석:** Step A(대사) → Step B(행동) → Step C(종합) 순차 분석 + 반박 검증
2. **Nova Pro 단일 모델:** 3단계 CoT 분석 + 반박 검증 + 패널 구조 추출까지 처리
3. **패널별 개별 생성:** 캐릭터 외모 일관성 + 각 패널 고품질 이미지
4. **CSS 대사 오버레이:** AI 이미지 텍스트 렌더링 한계를 구조적으로 해결
5. **Nova 4중 활용:** 분석(Pro) + 생성(Canvas) + 음성(Sonic) + 대사추출(Transcribe)
6. **음성 내레이션:** Nova 2 Sonic으로 대사 음성 재생 (on-demand)
7. **마스코트 캐릭터:** 납서(문어) + 짝이(너구리) 납짝 애니메이션
8. **프론트 중심 레이아웃 엔진:** View Layer에서 데이터 재해석

---

# 9. 🎯 기본 UX 전략

> 초기 진입 시 **🖼️ Panel Grid 기본 표시** (대사 ON, 영어), 상단에서 단일 페이지 모드로 전환 가능

* **이유:** 패널별 모드가 대사 정확도와 시각 품질 모두 우수하며, 사용자 인터랙션(언어 전환, 대사 토글) 제공

---

# 10. 📌 핵심 한 줄 요약

> **영상 → 3단계 CoT AI 심층 분석 + 반박 검증 → 패널별 이미지 생성 → CSS 대사 오버레이 + 음성 내레이션으로 정확한 N컷 만화 렌더링**
