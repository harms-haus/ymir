# Subagent: Frontend Dialogs Research

Investigate all dialog components in /root/ymir/apps/web/src.

## What to find:

1. **CreateWorktreeDialog**: Read `components/dialogs/CreateWorktreeDialog.tsx` fully
   - Does it use alert()/prompt()? 
   - What inputs does it have currently?
   - How does it communicate with the backend (WebSocket messages)?
   - What props does it accept?

2. **WorkspaceSettingsDialog**: Read `components/dialogs/WorkspaceSettingsDialog.tsx` fully
   - What fields does it currently have?
   - How does it save settings?
   - What WebSocket message does it send?

3. **ConfirmDialog**: Read `components/dialogs/ConfirmDialog.tsx`
   - How does the confirm dialog pattern work?

4. **ChangeBranchDialog**: Read `components/dialogs/ChangeBranchDialog.tsx`
   - What pattern does it use?

5. **baseUI Dialog components**: Search for Dialog-related components
   - Look in node_modules/@vibrant-minds/baseui or similar for Dialog primitives
   - What Dialog components are available? (Dialog, DialogTitle, DialogBody, DialogFooter, etc.)

6. **ContextMenu**: Read `components/ui/ContextMenu.tsx`
   - How does the context menu work for worktrees?
   - Is there a worktree-specific context menu?

7. **AlertDialog**: Read `components/ui/AlertDialog.tsx`

8. **WorkspaceTree**: Read `components/sidebar/WorkspaceTree.tsx`
   - How are worktrees rendered?
   - Where is the context menu triggered for worktrees?
   - How is the "create worktree" action triggered?

9. **package.json**: What UI library is used? (baseui, @vibrant-minds/baseui, etc.)

Report the full component signatures, props, and how dialogs are opened/closed.
