# Review Report: Rune bf-2cb9.1.1
## R1: Rewrite AcpChat to use acp-chat-react Thread and Composer

**Rune ID:** bf-2cb9.1.1
**Reviewer:** Review Sub-Orchestrator
**Review Date:** 2026-05-07
**Status:** PARTIALLY COMPLETE

---

## Executive Summary

Rune bf-2cb9.1.1 has been **partially implemented**. The AcpChat component has been successfully rewritten to use acp-chat-react's Thread and Composer components as specified. However, the implementation is incomplete because the dependencies required for it to function (Rune R2: AgentPane wiring) have not been implemented. As a result, the component cannot be used in production.

**Key Findings:**
- ✅ R1 (AcpChat rewrite): COMPLETE
- ❌ R2 (AgentPane wiring): NOT IMPLEMENTED
- ❌ R3 (Scrollbar fade): NOT IMPLEMENTED
- ❌ R4 (Settings row): NOT IMPLEMENTED
- ❌ R5 (Styling): NOT IMPLEMENTED
- ❌ R6 (Verification): NOT APPLICABLE (implementation incomplete)

---

## Review Findings by Lens

### 1. Specification Compliance

**Status: PARTIAL**

**Compliant Aspects:**
- ✅ AcpChat.tsx correctly imports Thread and Composer from @harms-haus/acp-chat-react
- ✅ AcpChat.tsx correctly imports AcpStore and SessionController types
- ✅ Props interface matches specification (agentTabId, agentType, store, controller)
- ✅ Removed @assistant-ui/react imports
- ✅ Removed AgentRuntimeProvider wrapper
- ✅ Thread configured with layout="expanded", followScroll={true}, follow={true}
- ✅ Composer configured with minRows={2}
- ✅ Component renders in flex container with Thread and Composer

**Non-Compliant Aspects:**
- ❌ AgentPane.tsx still passes old props to AcpChat (sessionId, worktreeId, threadId, onSendMessage)
- ❌ AgentPane.tsx does not call acpSessionManager.getOrCreateController()
- ❌ AgentPane.tsx does not pass AcpStore and SessionController to AcpChat
- ❌ No integration between AcpChat and the rest of the application
- ❌ TypeScript compilation error: AgentPane.tsx(272,23) - Type mismatch with new AcpChatProps interface

### 2. Implementation Completeness

**Status: INCOMPLETE**

**Implemented:**
- AcpChat component rewrite (all acceptance criteria met)
- Proper imports and type definitions
- Component structure matches spec

**Not Implemented:**
- AgentPane wiring (Rune R2)
- useScrollbarFade hook (Rune R3)
- YmirSettingsRow component (Rune R4)
- CSS styling with data-acp-* attribute selectors (Rune R5)
- Integration testing (Rune R6)

**Critical Gap:**
The AcpChat component cannot function without the SessionController and AcpStore instances being created and passed to it. These are created by acpSessionManager.getOrCreateController(), which is never called in the current codebase. As a result, the new AcpChat component will break when used.

### 3. Code Quality

**Status: GOOD**

**Strengths:**
- Clean, concise implementation (38 lines vs. 121 lines previously)
- Proper TypeScript typing
- No logic errors detected
- Follows React best practices
- Good separation of concerns (pure presentation layer)

**Issues:**
- None identified in the AcpChat.tsx implementation itself
- However, the component cannot be used due to missing dependencies

### 4. User Experience (UX)

**Status: CANNOT EVALUATE**

**Reason:**
The UX cannot be evaluated because:
1. The component is not integrated into the application
2. The required SessionController and AcpStore instances are not being created
3. The styling (Rune R5) is not implemented
4. The settings row (Rune R4) is not implemented
5. The scrollbar fade behavior (Rune R3) is not implemented

### 5. Integration Points

**Status: BROKEN**

**Broken Integration:**
The following integration points are broken:

1. **AgentPane.tsx → AcpChat.tsx:**
   - Expected props: agentTabId, agentType, store, controller
   - Actual props: sessionId, agentType, worktreeId, threadId, onSendMessage
   - Result: Type mismatch, runtime errors will occur

2. **acpSessionManager → AgentPane:**
   - Expected: AgentPane calls getOrCreateController() when agent sessions appear
   - Actual: Not called
   - Result: SessionControllers are never created, ACP events are dropped

3. **AcpChat → acpSessionManager:**
   - Expected: AcpChat receives store and controller from acpSessionManager
   - Actual: Not implemented
   - Result: AcpChat cannot render

---

## Acceptance Criteria Review

### Rune R1 Acceptance Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| AcpChat renders Thread and Composer from acp-chat-react | ✅ PASS | Lines 21-28, 29-35 |
| No imports from @assistant-ui/react | ✅ PASS | Only imports from @harms-haus/acp-chat-react |
| No dependency on AgentRuntimeProvider | ✅ PASS | Removed wrapper component |
| Props accept AcpStore + SessionController directly | ✅ PASS | Interface matches spec |
| Component is a pure presentation layer | ✅ PASS | Reads from store, renders components |

### Overall Plan Acceptance Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| acpSessionManager.getOrCreateController() called when agent sessions appear | ❌ FAIL | Not implemented in AgentPane.tsx |
| acpSessionManager.removeController() called when tabs close | ❌ FAIL | Not implemented in AgentPane.tsx |
| AcpChat receives valid AcpStore and SessionController | ❌ FAIL | AgentPane still passes old props |
| No onSendMessage callback needed | ❌ FAIL | AgentPane still creates and passes it |

---

## Risk Assessment

**HIGH RISK:**
- The new AcpChat component will cause runtime errors if used in its current state
- The breaking change in props interface is not reflected in the parent component
- No graceful degradation or backward compatibility provided

**MEDIUM RISK:**
- Missing integration will cause ACP events to be dropped silently
- No testing or verification of the implementation

**LOW RISK:**
- The AcpChat component implementation itself is sound
- No security or performance concerns identified

---

## Recommendations

### Immediate Actions Required:

1. **IMPLEMENT RUNE R2 (AgentPane wiring):**
   - Update AgentPane.tsx to call acpSessionManager.getOrCreateController()
   - Update AgentPane.tsx to pass store and controller to AcpChat
   - Remove handleSendMessage callback
   - Implement controller cleanup in handleCloseTab

2. **IMPLEMENT RUNE R4 (Settings row):**
   - Create YmirSettingsRow.tsx component
   - Add renderSettingsRow prop to Composer in AcpChat.tsx

3. **IMPLEMENT RUNE R5 (Styling):**
   - Update acp-chat.css with data-acp-* attribute selectors
   - Apply PROMPT-specified styling (user message bubbles, agent on-surface, etc.)

4. **IMPLEMENT RUNE R3 (Scrollbar fade):**
   - Create useScrollbarFade.ts hook
   - Apply to Thread component in AcpChat.tsx

5. **RUN VERIFICATION (Rune R6):**
   - Test the complete integration
   - Verify all acceptance criteria are met
   - Check for console errors and dropped payloads

### Future Considerations:

1. **Incremental Migration Strategy:**
   Consider implementing the migration in smaller, testable chunks to avoid breaking the application.

2. **Backward Compatibility:**
   Consider maintaining backward compatibility during the transition period, or ensure all dependent code is updated simultaneously.

3. **Testing:**
   Add unit tests for AcpChat, AgentPane, and the integration between them.

---

## Conclusion

Rune bf-2cb9.1.1 (R1) has been **successfully implemented** in isolation. The AcpChat component correctly uses acp-chat-react's Thread and Composer as specified. However, the implementation is **not usable** in its current state because the required dependencies (Rune R2 wiring) have not been implemented.

**Status: BLOCKED - Cannot merge until Rune R2 is implemented**

The implementation represents good progress, but the component cannot be used without the SessionController and AcpStore instances being created and passed to it. The missing AgentPane integration is a critical blocker that must be addressed before this implementation can be considered complete.

---

## Reviewer Notes

This review focuses solely on rune bf-2cb9.1.1 (R1). However, it's important to note that R1 is part of a larger implementation plan with 6 runes (R1-R6). While R1 is complete, the overall feature cannot be used until R2, R3, R4, R5, and R6 are implemented.

The execution order specified in the plan is:
```
R1 (AcpChat rewrite) → R2 (AgentPane wiring) → R4 (Settings row) → R5 (Styling) → R3 (Scrollbar fade) → R6 (Verification)
```

The implementer has completed R1 but stopped before R2. This creates an incomplete feature that cannot be tested or used. It is recommended to complete the remaining runes before considering this implementation complete.
