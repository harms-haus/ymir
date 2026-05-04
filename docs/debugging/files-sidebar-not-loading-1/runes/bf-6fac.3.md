# bf-6fac.3 — Add error state and retry UI in AllFilesTab

## Status: completed

## Description
Add a visible error state to the `AllFilesTab` component that displays when a `FILE_LIST_ERROR` (or any ErrorResponse) is received for a FileList request. Include the error message and a retry button.

## Files
- `apps/web/src/components/project/AllFilesTab.tsx`

## Changes
1. Add error state: `const [error, setError] = useState<string | null>(null);`
2. Update ErrorResponse handler (line 135-140):
   - Extract error message from the message (check `message.code` and `message.message` fields)
   - `setError(errorMessage)` in addition to `setIsLoading(false)`
3. Update FileListResult handler (line 142-174):
   - On success: `setError(null)` to clear any previous error
4. Add error render path between loading and "no files" checks:
   ```tsx
   if (error) {
     return (
       <div className="flex flex-col items-center justify-center p-4 text-center">
         <i className="ri-error-warning-line text-2xl text-red-400 mb-2" />
         <p className="text-sm text-gray-400 mb-2">Failed to load files</p>
         <p className="text-xs text-gray-500 mb-3 max-w-xs break-words">{error}</p>
         <button className="px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30" onClick={handleRetry}>Retry</button>
       </div>
     );
   }
   ```
5. Add `handleRetry` callback: clear error, set loading, resend FileList request
6. Clear `error` in the `activeWorktree` change effect
7. Clear `error` in the timeout handler

## Success criteria
- When `FILE_LIST_ERROR` arrives, user sees error message with retry button
- Retry clears error, shows loading, re-fetches file list
- Successful response clears error and shows file tree
- No TypeScript errors
