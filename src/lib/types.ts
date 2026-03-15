export type ArtStyle =
  | 'GRAPHIC_NOVEL_ILLUSTRATION'
  | 'SOFT_DIGITAL_PAINTING'
  | 'FLAT_VECTOR_ILLUSTRATION'
  | '3D_ANIMATED_FAMILY_FILM';

export type ModelProvider = 'NOVA';

export type DialogueLanguage = 'ko' | 'en';

export interface Panel {
  panelId: number;
  description: string;
  emotion: 'joy' | 'sadness' | 'surprise' | 'anger' | 'fear' | 'neutral';
  /** 영어 대사 (프론트 오버레이용) */
  dialogue?: string;
  /** 한국어 대사 (프론트 오버레이용) */
  dialogueKo?: string;
  /** 한국어 번역 (레거시 호환) */
  translation?: string;
  /** 영상에서 추출한 실제 대사 원문 */
  transcribedDialogue?: string;
  /** 패널별 개별 이미지 URL (패널별 생성 모드) */
  imageUrl?: string;
}

export interface StoryJson {
  videoId: string;
  duration: number;
  summary: string;
  /** 한국어 요약 */
  summaryKo?: string;
  climaxIndex: number;
  panels: Panel[];
  /** 단일 만화 페이지 이미지 URL (레거시 모드) */
  comicPageUrl: string;
  /** 사용된 모델 목록 */
  modelsUsed: string[];
  /** @deprecated Use modelsUsed instead */
  novaModelsUsed?: string[];
  modelProvider?: ModelProvider;
  hasAudioDialogue: boolean;
  artStyle: ArtStyle;
  dialogueLanguage: DialogueLanguage;
  /** 캐릭터 외모 설명 (이미지 생성 일관성용) */
  characterDescriptions?: string;
  /** 패널별 개별 이미지 모드 여부 */
  isPanelMode?: boolean;
  /** AWS Transcribe 대사 추출 결과 */
  transcribeText?: string;
}

export type ViewMode = 'panel' | 'page';

export type JobStatus = 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type JobProgress =
  | 'uploaded'
  | 'transcribing'
  | 'extracting_frames'
  | 'analyzing_pass1_stepA'
  | 'analyzing_pass1_stepB'
  | 'analyzing_pass1_debate'
  | 'analyzing_pass1_stepC'
  | 'verifying'
  | 'analyzing_pass2'
  | 'generating_comic'
  | 'generating_panels'
  | 'completed';

export interface Job {
  id: string;
  status: JobStatus;
  videoKey?: string;
  storyJson?: StoryJson;
  error?: string;
  progress?: JobProgress;
  progressDetail?: string;
  createdAt: number;
}