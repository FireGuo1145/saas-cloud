export interface User {
  id?: number;
  username: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  id?: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at?: string | null;
  created_at: string;
}

export type PublicUser = Omit<User, "password_hash">;
