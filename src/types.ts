export interface ViralPost {
  id: string;
  url: string;
  caption: string;
  views: number;
  likes: number;
  shares: number;
  progress: number;
  thumbnailUrl?: string;
  comments?: number;
}

export interface UserState {
  chatId: number;
  category?: string;
  language?: 'fa' | 'en';
  minViews?: number;
  lastResults?: ViralPost[];
  offset?: number;
  batchSize?: number;
  sent?: number;
  total?: number;
}
