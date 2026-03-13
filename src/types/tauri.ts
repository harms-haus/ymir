// TypeScript interfaces matching Rust backend responses (src-tauri/src/git.rs)
// These types mirror the serde-serialized structs from the Tauri backend

// ============================================================================
// Rust Response Types (matching src-tauri/src/git.rs structs)
// ============================================================================

/**
 * Rust FileStatus enum serialized as string
 * See git.rs FileStatus enum for all variants
 */
export type RustFileStatus =
  | 'Added'
  | 'StagedModified'
  | 'StagedDeleted'
  | 'StagedRenamed'
  | 'Modified'
  | 'Deleted'
  | 'Untracked'
  | 'Ignored'
  | 'Conflicted'
  | 'Clean';

/**
 * Rust GitFile struct (serde camelCase)
 */
export interface RustGitFile {
  path: string;
  status: RustFileStatus;
  secondaryStatus?: RustFileStatus | null;
}

/**
 * Rust GitStatus struct (serde camelCase)
 */
export interface RustGitStatus {
  repoPath: string;
  currentBranch: string;
  files: RustGitFile[];
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  aheadCount: number;
  behindCount: number;
}

/**
 * Rust BranchInfo struct (serde camelCase)
 */
export interface RustBranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
  upstream?: string | null;
}
