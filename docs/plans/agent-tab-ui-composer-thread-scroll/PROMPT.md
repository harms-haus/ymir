# Agent Tab UI – Composer, Thread, and Scroll Behaviors

## Context
Implement the agent tab UI for the Ymir project, which is a full-stack project with a Rust WebSocket server and a React/TypeScript web client. The components are built with custom CSS and use `acp-chat-react` and `acp-chat-core` packages linked from `~/acp-chat-ui-react/`.

## Requirements

### 1. Composer (Bottom-Aligned)
- Aligned to the bottom of the agent panel.
- Appears as a `<textarea>` with a border and corner radius.
- Minimum of 2 text rows for input.
- A single row is reserved across the bottom of the composer for controls:
  - **Left-aligned:** ACP Mode Select, ACP Model Select, ACP Session Select.
  - **Middle:** Gap.
  - **Right-aligned:** Submit/Stop button.

### 2. Thread (Above the Composer)
- Takes the remaining vertical space above the composer.
- Width matches the agent panel (no maximum width for the thread).
- **Agent messages:** Appear on the surface of the thread (no bubble), aligned left with a medium left margin.
- **User messages:** Appear as a bubble, aligned right in the thread with a medium right margin.
- **Tool stacks:** On-surface, aligned left (smaller padding, same margin as agent messages). They should be expandable to show tool calls.
  - Each tool call should be a bubble with small padding and corner radius.
  - Each tool call should be expandable to show the tool result.

### 3. Scroll Bar
- Aligned to the right of the thread.
- Width: 3px (no track).
- Rounded top and bottom.
- Should fade when the mouse hasn't moved in 5 seconds. The mouse move boundary is the thread component.

### 4. Jump to Latest Button
- A floating button centered left/right.
- Aligned to the bottom of the thread.
- Appears when scrolled away from the bottom.
- Clicking it jumps to the latest message.

## Constraints
- Use `acp-chat-react` components with custom styling where possible.
- If a requirement is not achievable with `acp-chat-react` components, **HALT** and ask for further instructions. The likely response will be to edit `acp-chat-react` to support it, but the user wants oversight on such changes.
- Do not add Ymir-specific features into `acp-chat-react` or `acp-chat-core` where they don't belong.
- `acp-chat-core` exclusively operates on ACP events to convert them to renderable state.
- `acp-chat-react` takes renderable state and renders it.
