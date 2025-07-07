export type TwitchStreams = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: Date;
  language: string;
  thumbnail_url: string;
  tag_ids: number[]; // unsure, seems to be deprecated.
  tags: string[];
  is_mature: boolean;
}