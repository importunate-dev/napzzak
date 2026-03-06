복잡한 다이어그램 코드(SVG 데이터)와 이미지 링크가 잔뜩 섞여 있어서 AI 개발 도구나 프롬프트에 그대로 복사해 넣기에는 무리가 있는 상태였네요. 충분히 이해합니다!

AI가 아키텍처와 요구사항을 완벽하게 이해하고 바로 코드를 작성하거나 구조를 잡을 수 있도록, 불필요한 코드는 제거하고 핵심 흐름을 텍스트와 의미론적 태그로 깔끔하게 정제해 드립니다.

---

# 1. 🎯 프로젝트 개요

## 🔹 목표

영상을 업로드하면 AI 분석을 통해 **스토리 기반 N컷 만화로 자동 변환**하는 서비스 구현

## 🔹 핵심 전략

* 실시간 스트리밍 ❌
* **업로드 기반 처리 ⭕**
* YouTube 링크 입력은 Beta 단계

## 🔹 최종 결과물

하나의 영상 → 하나의 Story JSON → 아래 3가지 모드로 렌더링

1. 📜 **Scroll형** (웹툰형)
2. 🟦 **4컷 요약형**
3. 🧩 **Masonry** (비정형 메이슨리)

---

# 2. 🧠 전체 시스템 아키텍처

## 🔹 High-Level Architecture

---

# 3. 🔄 오케스트레이션 구조

## 🔹 핵심 원칙

* AI 호출은 **1회**
* Story JSON을 중심으로 모든 뷰가 동작
* View는 프론트에서 처리

## 🔹 상세 처리 흐름

---

# 4. 📦 Story JSON 구조 설계

## 🔹 핵심 데이터 모델

```json
{
  "videoId":"uuid",
  "duration":180,
  "cuts": [
    {
      "cutId":1,
      "timestampStart":12,
      "timestampEnd":18,
      "imageUrl":"frame.jpg",
      "dialogue":"대사 텍스트",
      "emotion":"surprise",
      "importanceScore":0.87
    }
  ],
  "summary":"전체 요약 문장",
  "climaxIndex":5
}

```

## 🔹 필수 필드 설명

| 필드 | 역할 |
| --- | --- |
| **emotion** | 메이슨리 강조 기준 |
| **importanceScore** | 4컷 선택 기준 |
| **climaxIndex** | 스토리 피크 강조 |
| **timestamp** | 시간 순 정렬 |

---

# 5. 🖼️ 최종 3모드 전략

## 5-1. 📜 Scroll Mode (기본 모드)

* **특징:** 시간 순 정렬, 웹툰형 세로 스크롤, 모바일 최적, 가장 안정적인 UX (기본 진입 화면)
* **흐름:** StoryJSON → TimeSort → VerticalRender

## 5-2. 🟦 4컷 Mode (요약 모드)

* **특징:** importanceScore 상위 4개 선택, 시간 순 유지, 2x2 Grid 배치, SNS 공유/카드뉴스 마케팅 활용 가능
* **흐름:** StoryJSON → SortByImportance → SelectTop4 → GridRender

## 5-3. 🧩 Masonry Mode (차별화 모드)

* **특징:** Pinterest 스타일 레이아웃 기반 스토리 강조 구조. importanceScore로 카드 크기 결정, emotion으로 강조 스타일 결정, climaxIndex가 가장 큰 카드로 배치됨. "AI 구조 재해석" 강조.
* **흐름:** StoryJSON → CalculateCardSize → MasonryLayoutEngine → DynamicRender

---

# 6. 🧑‍💻 프론트엔드 역할 정리

## 🔹 1. 업로드 UX 설계

* Drag & Drop
* 업로드 진행률
* 처리 상태 Polling

## 🔹 2. Story Rendering Engine 구현

* **ScrollRenderer:** 시간 순 세로 렌더 → 시간 기반 소비
* **Grid4Renderer:** importance 기반 4컷 → 정보 압축
* **MasonryRenderer:** 비정형 레이아웃 → 감정/클라이맥스 기반 재해석

## 🔹 3. 상태 관리

* processing / completed / failed
* TanStack Query / SWR 유사 구조 적용 가능

## 🔹 4. 레이아웃 전환 UX

* 상단 모드 토글
* 동일 Story JSON 재사용 (**AI 재호출 없음**)

---

# 7. 🧱 확장 전략

* **Phase 1 (Hackathon 제출용):** 영상 업로드 → Nova 분석 → Story JSON 생성 → 3모드 렌더링
* **Phase 2 (Beta):** YouTube 링크 입력 → 클라우드 영상 추출 → 자동 변환
* **Phase 3:** SNS 공유, PDF 만화 변환, 브랜드 템플릿 기능

---

# 8. 🔥 차별화 포인트

1. **AI 1회 호출 구조:** 비용 절감 및 구조적 설계 강조
2. **Story 기반 메이슨리:** 단순 Grid가 아닌 감정/클라이맥스 기반 동적 레이아웃
3. **프론트 중심 레이아웃 엔진:** View Layer에서 데이터 재해석

---

# 9. 🎯 기본 UX 전략 제안

> 초기 진입 시 **📜 Scroll 기본 표시** 후, 상단에서 4컷 / Masonry로 전환 가능하도록 구성

* **이유:** Scroll이 가장 자연스러운 콘텐츠 소비 방식이며, Masonry는 시각적 임팩트용, 4컷은 SNS 공유용으로 적합함.

---

# 10. 📌 핵심 한 줄 요약

> **영상 → AI 분석 → Story JSON → 동일 데이터로 3가지 만화 모드 렌더링하는 프론트엔드 중심의 구조적 서비스**

---

이렇게 텍스트만으로 깔끔하게 정리해 두면 AI가 아키텍처를 훨씬 더 명확하게 인식할 수 있습니다.

이 기획안을 바탕으로 **프론트엔드(React/Next.js 등)의 기본 폴더 구조와 Story JSON 타입 인터페이스(TypeScript) 코드**를 먼저 작성해 드릴까요?