export type ArtStyle =
  | 'GRAPHIC_NOVEL_ILLUSTRATION'
  | 'SOFT_DIGITAL_PAINTING'
  | 'FLAT_VECTOR_ILLUSTRATION'
  | '3D_ANIMATED_FAMILY_FILM';

export type DialogueLanguage = 'ko' | 'en';

export interface Panel {
  panelId: number;
  description: string;
  emotion: 'joy' | 'sadness' | 'surprise' | 'anger' | 'fear' | 'neutral';
  /** 대사 없는 만화 모드에서는 비어 있음 */
  dialogue?: string;
  translation?: string;
  transcribedDialogue?: string;
}

export interface StoryJson {
  videoId: string;
  duration: number;
  summary: string;
  climaxIndex: number;
  panels: Panel[];
  comicPageUrl: string;
  novaModelsUsed: string[];
  hasAudioDialogue: boolean;
  artStyle: ArtStyle;
  dialogueLanguage: DialogueLanguage;
}

export type ViewMode = 'scroll' | 'four-cut' | 'masonry';

export type JobStatus = 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type JobProgress =
  | 'uploaded'
  | 'analyzing'
  | 'generating_comic'
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
