export type SummaryMode = "quick" | "detailed" | "learning";
export type SummaryFocus =
  | "full"
  | "summary_only"
  | "action_items"
  | "definitions"
  | "chapters_only";
export type KnowledgeLevel = "beginner" | "intermediate" | "advanced";
export type LearningSpeed = "slow" | "moderate" | "fast";
export type SchedulingMode = "intensive" | "balanced" | "relaxed" | "custom";

export interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
  timestamp: string;
}

export interface TranscriptChunk {
  index: number;
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  content: string;
  summary?: string;
  embedding?: number[];
}

export interface VideoChapter {
  startSeconds: number;
  timestamp: string;
  title: string;
  summary: string;
}

export interface VideoMetadata {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  description: string;
  thumbnailUrl: string;
  durationSeconds: number;
  durationFormatted: string;
  language: string;
  isAutoCaptions: boolean;
  hasTranscript: boolean;
  wordCount: number;
  sourceType:
    | "captions"
    | "audio_transcription"
    | "uploaded_media"
    | "user_text"
    | "metadata_fallback";
}

export interface VideoSummary {
  mode: SummaryMode;
  focus?: SummaryFocus;
  level: KnowledgeLevel;
  language: string;
  engine: string;
  tldr: string;
  keyPoints: string[];
  definitions: Array<{ term: string; definition: string }>;
  actionItems: string[];
  quotes: string[];
  topics: string[];
  chapters: VideoChapter[];
}

export interface ProcessedVideoPayload {
  video: VideoMetadata;
  summary: VideoSummary;
  transcript: TranscriptSegment[];
  chunks: TranscriptChunk[];
  warning?: string;
}

export interface ChatCitation {
  timestamp: string;
  startSeconds: number;
  excerpt: string;
  score: number;
}

export interface ChatResponsePayload {
  answer: string;
  groundedInTranscript: boolean;
  citations: ChatCitation[];
  engine: string;
}

export interface QuizQuestion {
  id: string;
  type: "mcq" | "true_false" | "short_answer";
  topic: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface FlashcardItem {
  id: string;
  topic: string;
  front: string;
  back: string;
  deepNote?: string;
  example?: string;
  timestamp?: string;
  intervalDays: number;
  status: "learning" | "review" | "known";
}

export interface MindMapNodeData {
  id: string;
  label: string;
  category: "root" | "topic" | "concept";
  description?: string;
  parentId?: string;
}

export interface PresentationSlide {
  title: string;
  bullets: string[];
  speakerNotes: string;
}

export interface CourseLesson {
  id: string;
  order: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  estimatedMinutes: number;
  difficulty: KnowledgeLevel;
  objectives: string[];
  keyConcepts: string[];
  aiExplanation: string;
  practicePrompt: string;
  completed: boolean;
}

export interface CourseModule {
  id: string;
  order: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  difficulty: KnowledgeLevel;
  lessons: CourseLesson[];
}

export interface LearningProfileInput {
  deadlineDays: number;
  dailyMinutes: number;
  knowledgeLevel: KnowledgeLevel;
  learningSpeed: LearningSpeed;
  schedulingMode: SchedulingMode;
  preferredTime: string;
  breakMinutes: number;
  daysOff: string[];
}

export interface StudySession {
  id: string;
  dayNumber: number;
  dateISO: string;
  startTime: string;
  endTime: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
  videoStartTimestamp: string;
  videoEndTimestamp: string;
  viewingMinutes: number;
  practiceMinutes: number;
  notesMinutes: number;
  breakMinutes: number;
  status: "scheduled" | "completed" | "missed" | "rescheduled";
}

export interface SchedulePlan {
  feasible: boolean;
  feasibilityMessage: string;
  recommendedDays: number;
  recommendedDailyMinutes: number;
  totalRequiredMinutes: number;
  totalAvailableMinutes: number;
  estimatedCompletionDate: string;
  sessions: StudySession[];
  spacedRevisions: Array<{
    revisionLabel: string;
    dayOffset: number;
    dateISO: string;
    focusTopics: string[];
  }>;
}

export interface GeneratedCourse {
  id: string;
  title: string;
  description: string;
  videoId: string;
  videoTitle: string;
  totalVideoSeconds: number;
  estimatedStudyMinutes: number;
  objectives: string[];
  modules: CourseModule[];
  projectIdea: {
    title: string;
    description: string;
    criteria: string[];
  };
  schedule: SchedulePlan;
  engine: string;
}

export interface SystemHealthStatus {
  status: "ok";
  supabaseConfigured: boolean;
  aiProviders: {
    gemini: boolean;
    openai: boolean;
    nvidia: boolean;
    activeDefault: "gemini" | "openai" | "nvidia" | "local-nlp";
  };
  youtubeApiConfigured: boolean;
}
