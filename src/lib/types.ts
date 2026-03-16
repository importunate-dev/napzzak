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
  /** English dialogue (for front-end overlay) */
  dialogue?: string;
  /** Korean dialogue (for front-end overlay) */
  dialogueKo?: string;
  /** Korean translation (legacy compatibility) */
  translation?: string;
  /** Original dialogue extracted from video */
  transcribedDialogue?: string;
  /** Individual image URL per panel (panel generation mode) */
  imageUrl?: string;
  /** This panel's role in the story arc (e.g., 'Setup: A man sits alone at a table, contemplating') */
  narrativeContext?: string;
}

export interface StoryJson {
  videoId: string;
  duration: number;
  summary: string;
  /** Korean summary */
  summaryKo?: string;
  climaxIndex: number;
  panels: Panel[];
  /** Single comic page image URL (legacy mode) */
  comicPageUrl: string;
  /** List of models used */
  modelsUsed: string[];
  /** @deprecated Use modelsUsed instead */
  novaModelsUsed?: string[];
  modelProvider?: ModelProvider;
  hasAudioDialogue: boolean;
  artStyle: ArtStyle;
  dialogueLanguage: DialogueLanguage;
  /** Character appearance description (for image generation consistency) */
  characterDescriptions?: string;
  /** Whether using per-panel image mode */
  isPanelMode?: boolean;
  /** AWS Transcribe dialogue extraction result */
  transcribeText?: string;
  /** Original YouTube URL */
  youtubeUrl?: string;
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
  | 'pass2_planning'
  | 'pass2_describing'
  | 'pass2_reviewing'
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