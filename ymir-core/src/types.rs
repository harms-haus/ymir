//! Core shared types for Ymir workspace management
//!
//! This module defines workspace/pane/tab hierarchy that mirrors
//! TypeScript types in src/state/types.ts. These types are database-agnostic
//! and can be serialized for WebSocket communication.

use serde::{Deserialize, Serialize};

// ============================================================================
// Direction and Axis Types
// ============================================================================

/// Split direction for pane operations
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitDirection {
    Left,
    Right,
    Up,
    Down,
}

/// Axis orientation for split groups
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitAxis {
    Horizontal,
    Vertical,
}

// ============================================================================
// Scrollback Types
// ============================================================================

/// Single line in terminal scrollback
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollbackLine {
    /// Raw text content of line
    pub text: String,
    /// ANSI escape codes for styling (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ansi: Option<String>,
    /// Timestamp when line was received (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
}

// ============================================================================
// Tab Types
// ============================================================================

/// Tab type discriminator
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TabType {
    Terminal,
}

/// A tab in a pane
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    /// Unique identifier for this tab
    pub id: String,
    /// Tab type discriminator
    #[serde(rename = "type")]
    pub tab_type: TabType,
    /// Display title (usually shell name or cwd basename)
    pub title: String,
    /// Current working directory
    pub cwd: String,
    /// PTY session identifier (from Tauri)
    #[serde(rename = "sessionId")]
    pub session_id: String,
    /// Optional git branch name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_branch: Option<String>,
    /// Whether this tab has unread notifications
    pub has_notification: bool,
    /// Number of unread notifications
    pub notification_count: u32,
    /// Most recent notification message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_text: Option<String>,
    /// Terminal scrollback history (circular buffer)
    pub scrollback: Vec<ScrollbackLine>,
}

// ============================================================================
// Pane Types
// ============================================================================

/// Pane (split window) containing multiple tabs
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pane {
    /// Unique identifier for this pane
    pub id: String,
    /// Flex ratio for this pane (0-1, relative to siblings)
    pub flex_ratio: f64,
    /// Array of tabs in this pane
    pub tabs: Vec<Tab>,
    /// Currently active tab ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_tab_id: Option<String>,
    /// Whether this pane has notifications (from any tab)
    pub has_notification: bool,
}

// ============================================================================
// Split Tree Types (Discriminated Union)
// ============================================================================

/// Branch node: contains split children
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchNode {
    /// Unique identifier for this branch node
    pub id: String,
    /// Axis orientation for this split
    pub axis: SplitAxis,
    /// Child nodes (must be exactly 2: left/top and right/bottom)
    pub children: [Box<SplitNode>; 2],
}

impl BranchNode {
    /// Create a new branch node from two child nodes
    pub fn new(id: String, axis: SplitAxis, left: SplitNode, right: SplitNode) -> Self {
        Self {
            id,
            axis,
            children: [Box::new(left), Box::new(right)],
        }
    }
}

/// Leaf node: references a pane
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeafNode {
    /// Reference to pane containing terminal tabs
    #[serde(rename = "paneId")]
    pub pane_id: String,
}

impl LeafNode {
    /// Create a new leaf node
    pub fn new(pane_id: String) -> Self {
        Self { pane_id }
    }
}

/// Union type for split tree nodes (discriminated by 'type' field)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SplitNode {
    #[serde(rename = "branch")]
    Branch(Box<BranchNode>),
    #[serde(rename = "leaf")]
    Leaf(LeafNode),
}

impl SplitNode {
    /// Check if this node is a branch
    pub fn is_branch(&self) -> bool {
        match self {
            SplitNode::Branch(_) => true,
            _ => false,
        }
    }

    /// Check if this node is a leaf
    pub fn is_leaf(&self) -> bool {
        match self {
            SplitNode::Leaf(_) => true,
            _ => false,
        }
    }

    /// Get node type discriminator
    pub fn node_type(&self) -> &str {
        match self {
            SplitNode::Branch(_) => "branch",
            SplitNode::Leaf(_) => "leaf",
        }
    }
}

// ============================================================================
// Workspace Types
// ============================================================================

/// Workspace containing a tree of panes
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    /// Unique identifier for this workspace
    pub id: String,
    /// Display name (e.g., "Workspace 1")
    pub name: String,
    /// Root split node (tree of panes)
    pub root: SplitNode,
    /// Currently active pane ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_pane_id: Option<String>,
    /// Notification state for this workspace
    pub has_notification: bool,
}

// ============================================================================
// Error Types
// ============================================================================

/// Core error type for ymir-core operations
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CoreError {
    /// Invalid workspace ID
    InvalidWorkspaceId(String),
    /// Invalid pane ID
    InvalidPaneId(String),
    /// Invalid tab ID
    InvalidTabId(String),
    /// Invalid split node structure
    InvalidSplitTree(String),
    /// Database error
    Database(String),
    /// PTY error
    PtyError(String),
    /// Serialization error
    SerializationError(String),
    /// Deserialization error
    DeserializationError(String),
    /// Generic error
    Other(String),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::InvalidWorkspaceId(msg) => write!(f, "Invalid workspace ID: {}", msg),
            CoreError::InvalidPaneId(msg) => write!(f, "Invalid pane ID: {}", msg),
            CoreError::InvalidTabId(msg) => write!(f, "Invalid tab ID: {}", msg),
            CoreError::InvalidSplitTree(msg) => write!(f, "Invalid split tree: {}", msg),
            CoreError::Database(msg) => write!(f, "Database error: {}", msg),
            CoreError::PtyError(msg) => write!(f, "PTY error: {}", msg),
            CoreError::SerializationError(msg) => write!(f, "Serialization error: {}", msg),
            CoreError::DeserializationError(msg) => write!(f, "Deserialization error: {}", msg),
            CoreError::Other(msg) => write!(f, "Error: {}", msg),
        }
    }
}

impl std::error::Error for CoreError {}

/// Result type alias for CoreError
pub type Result<T> = std::result::Result<T, CoreError>;

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scrollback_line_serialization_roundtrip() {
        let line = ScrollbackLine {
            text: "test output".to_string(),
            ansi: Some("\x1b[31m".to_string()),
            timestamp: Some(1234567890),
        };

        let json = serde_json::to_string(&line).unwrap();
        let deserialized: ScrollbackLine = serde_json::from_str(&json).unwrap();

        assert_eq!(line, deserialized);
    }

    #[test]
    fn test_tab_serialization_roundtrip() {
        let tab = Tab {
            id: "tab-1".to_string(),
            tab_type: TabType::Terminal,
            title: "bash".to_string(),
            cwd: "/home/user".to_string(),
            session_id: "session-123".to_string(),
            git_branch: Some("main".to_string()),
            has_notification: true,
            notification_count: 3,
            notification_text: Some("Build complete".to_string()),
            scrollback: vec![
                ScrollbackLine {
                    text: "line 1".to_string(),
                    ansi: None,
                    timestamp: None,
                },
                ScrollbackLine {
                    text: "line 2".to_string(),
                    ansi: None,
                    timestamp: None,
                },
            ],
        };

        let json = serde_json::to_string(&tab).unwrap();
        let deserialized: Tab = serde_json::from_str(&json).unwrap();

        assert_eq!(tab, deserialized);
    }

    #[test]
    fn test_pane_serialization_roundtrip() {
        let pane = Pane {
            id: "pane-1".to_string(),
            flex_ratio: 0.5,
            tabs: vec![],
            active_tab_id: None,
            has_notification: false,
        };

        let json = serde_json::to_string(&pane).unwrap();
        let deserialized: Pane = serde_json::from_str(&json).unwrap();

        assert_eq!(pane, deserialized);
    }

    #[test]
    fn test_leaf_node_creation() {
        let leaf = LeafNode::new("pane-1".to_string());
        let split_node = SplitNode::Leaf(leaf.clone());

        assert_eq!(split_node.node_type(), "leaf");
        assert_eq!(leaf.pane_id, "pane-1");
    }

    #[test]
    fn test_branch_node_creation() {
        let left = SplitNode::Leaf(LeafNode::new("pane-1".to_string()));
        let right = SplitNode::Leaf(LeafNode::new("pane-2".to_string()));
        let branch = BranchNode::new("branch-1".to_string(), SplitAxis::Horizontal, left, right);

        assert_eq!(branch.axis, SplitAxis::Horizontal);
        assert_eq!(branch.children[0].node_type(), "leaf");
        assert_eq!(branch.children[1].node_type(), "leaf");
    }

    #[test]
    fn test_split_node_is_branch() {
        let left = SplitNode::Leaf(LeafNode::new("pane-1".to_string()));
        let right = SplitNode::Leaf(LeafNode::new("pane-2".to_string()));
        let branch = BranchNode::new("branch-1".to_string(), SplitAxis::Horizontal, left, right);
        let split_node = SplitNode::Branch(Box::new(branch));

        assert!(split_node.is_branch());
        assert!(!split_node.is_leaf());
        assert_eq!(split_node.node_type(), "branch");
    }

    #[test]
    fn test_split_node_is_leaf() {
        let leaf = SplitNode::Leaf(LeafNode::new("pane-1".to_string()));

        assert!(!leaf.is_branch());
        assert!(leaf.is_leaf());
        assert_eq!(leaf.node_type(), "leaf");
    }

    #[test]
    fn test_workspace_serialization_roundtrip() {
        let root = SplitNode::Leaf(LeafNode::new("pane-1".to_string()));
        let workspace = Workspace {
            id: "workspace-1".to_string(),
            name: "Workspace 1".to_string(),
            root,
            active_pane_id: Some("pane-1".to_string()),
            has_notification: false,
        };

        let json = serde_json::to_string(&workspace).unwrap();
        let deserialized: Workspace = serde_json::from_str(&json).unwrap();

        assert_eq!(workspace, deserialized);
    }

    #[test]
    fn test_core_error_display() {
        let err = CoreError::InvalidWorkspaceId("ws-123".to_string());
        assert_eq!(err.to_string(), "Invalid workspace ID: ws-123");

        let err = CoreError::InvalidSplitTree("malformed".to_string());
        assert_eq!(err.to_string(), "Invalid split tree: malformed");
    }

    #[test]
    fn test_split_axis_serialization() {
        let axis = SplitAxis::Horizontal;
        let json = serde_json::to_string(&axis).unwrap();
        let deserialized: SplitAxis = serde_json::from_str(&json).unwrap();

        assert_eq!(axis, deserialized);
        assert_eq!(json, "\"horizontal\"");
    }

    #[test]
    fn test_split_direction_serialization() {
        let direction = SplitDirection::Right;
        let json = serde_json::to_string(&direction).unwrap();
        let deserialized: SplitDirection = serde_json::from_str(&json).unwrap();

        assert_eq!(direction, deserialized);
        assert_eq!(json, "\"right\"");
    }
}
