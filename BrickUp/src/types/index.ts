export interface Session {
  id: string;
  slug: string;
  set_num: string;
  set_name: string;
  set_img_url: string | null;
  created_at: string;
}

export interface SessionPart {
  id: number;
  part_num: string;
  part_name: string;
  part_img_url: string | null;
  color_id: number;
  color_name: string;
  color_rgb: string;
  element_id: string | null;
  category: string | null;
  qty_needed: number;
  qty_found: number;
  is_spare: boolean;
}

export interface SessionData {
  session: Session;
  parts: SessionPart[];
}

export interface RebrickableSet {
  set_num: string;
  name: string;
  set_img_url: string | null;
}

export interface RebrickablePart {
  part_num: string;
  part_name: string;
  part_img_url: string | null;
  color_id: number;
  color_name: string;
  color_rgb: string;
  element_id: string | null;
  category: string | null;
  qty_needed: number;
  is_spare: boolean;
}
