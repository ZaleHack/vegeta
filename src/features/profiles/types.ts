export interface ProfileAttachment {
  id: number;
  file_path: string;
  original_name: string | null;
}

export interface ProfileListItem {
  id: number;
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  photo_path: string | null;
  extra_fields?: string | null;
  attachments?: ProfileAttachment[];
  archived_at?: string | null;
  owner_login?: string | null;
  owner_division_id?: number | null;
  created_at?: string;
  shared_with_me?: boolean;
  shared_user_ids?: number[];
  is_owner?: boolean;
}

export interface ProfilesResponse {
  profiles: ProfileListItem[];
  total: number;
}

export interface ProfileResponse {
  profile: ProfileListItem;
}
