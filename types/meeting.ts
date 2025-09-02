export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  attendees: Attendee[];
  status: 'recording' | 'processing' | 'completed' | 'error';
  audioUri?: string;
  transcript?: Transcript;
  artifacts?: MeetingArtifacts;
}

export interface Attendee {
  name: string;
  email?: string;
  role?: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
  speakers: Speaker[];
  confidence: number;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface ActionItem {
  id: string;
  title: string;
  assignee: string;
  assignee_email?: string;
  due_date?: string;
  priority: 'High' | 'Medium' | 'Low';
  dependencies: string[];
  status: 'Not Started' | 'In Progress' | 'Blocked' | 'Done';
  source_quote: string;
  confidence: number;
  tags: string[];
}

export interface Decision {
  id: string;
  statement: string;
  rationale?: string;
  source_quote: string;
  confidence: number;
  tags: string[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  owner?: string;
  needed_by?: string;
  source_quote: string;
}

export interface MeetingArtifacts {
  action_items: ActionItem[];
  decisions: Decision[];
  open_questions: OpenQuestion[];
  summaries: {
    executive_120w: string;
    detailed_400w: string;
    bullet_12: string[];
  };
  email_draft?: EmailDraft;
}

export interface EmailDraft {
  subject: string;
  body_markdown: string;
  recipients_suggested: string[];
  cc_suggested: string[];
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioLevels: number[];
  currentMeeting?: Meeting;
}