# T31: Alert Dialog for Destructive Actions - Learnings

## Base UI AlertDialog API

- Import from `@base-ui/react/alert-dialog`
- Component structure: `AlertDialog.Root` → `AlertDialog.Portal` → `AlertDialog.Backdrop` + `AlertDialog.Viewport` → `AlertDialog.Popup`
- The `AlertDialog.Title` renders as `<h2>` by default
- The `AlertDialog.Description` renders as `<p>` by default
- `AlertDialog.Close` renders as a `<button>` by default

## Event Handling

- The `onOpenChange` callback receives `AlertDialogRootChangeEventDetails` object, not a simple Event
- To detect Escape key: check `eventDetails.event instanceof KeyboardEvent`
- Base UI handles the escape key automatically - the dialog closes but you can hook into the event

## Controlled Component Pattern

- Must pass `open` and `onOpenChange` props to `AlertDialog.Root`
- The dialog is modal by default - clicking outside does NOT close it (desired behavior for destructive actions)
- Escape key closes the dialog (triggers onOpenChange with false)

## Styling

- Use inline styles for Base UI components (they're unstyled by default)
- CSS variables used:
  - `hsl(var(--primary))` for default variant confirm button
  - `hsl(var(--destructive))` for destructive variant confirm button
  - `hsl(var(--card))` for dialog background
  - `hsl(var(--border))` for borders
  - `hsl(var(--muted-foreground))` for description text

## Icons

- Use Remix Icon CSS classes: `ri-question-line` for default, `ri-alert-line` for destructive
- Icons are rendered with `<i className="ri-xxx-line">`

## Zustand Integration

- Store state shape: `alertDialog: AlertDialogState | null`
- Actions: `showAlertDialog(config)` and `hideAlertDialog()`
- The `AlertDialogConfig` type includes the callback functions (onConfirm, onCancel)
- This allows the dialog to be shown from anywhere in the app via the hook

## Hook Pattern

- `useAlertDialog()` hook provides:
  - `alertDialog` - current state from store
  - `show(config)` - generic show method
  - `showDestructive()` - convenience method for destructive variant
  - `showDefault()` - convenience method for default variant
  - `hide()` - close dialog

## Testing Notes

- Use `fireEvent.keyDown(document, { key: 'Escape' })` to test escape key
- Base UI renders to a portal, so use `document.querySelector` for portal content
- The `AlertDialog.Title` renders as `<h2>`, not `<span>`