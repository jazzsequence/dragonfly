export interface InvertContent {
  // Required
  id: string;
  slug: string;
  title: string;
  body: string;
  contentType: string;

  // Optional
  date?: string;
  modified?: string;
  author?: string;
  excerpt?: string;
  featuredImage?: string;
  taxonomies?: Record<string, string[]>;
  meta?: Record<string, unknown>;
  // undefined is treated as published — backwards compatible with existing content
  status?: 'draft' | 'published';
}

export interface InvertAdapter {
  name: string;
  getAll(): Promise<InvertContent[]>;
  getBySlug(slug: string): Promise<InvertContent | null>;
  getByType(contentType: string): Promise<InvertContent[]>;
  isDynamic?: boolean;
}
