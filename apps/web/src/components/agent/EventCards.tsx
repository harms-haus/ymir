import { useCallback } from 'react';
import { ContentPartPrimitive } from '@assistant-ui/react';
import type {
  PermissionCardSchema,
  ToolCardSchema,
  PlanCardSchema,
  StatusCardSchema,
  UnknownCardSchema,
} from './card-schema';
import {
  isPermissionCardSchema,
  isToolCardSchema,
  isPlanCardSchema,
  isStatusCardSchema,
  isUnknownCardSchema,
} from './card-schema';

interface PermissionCardProps {
  schema: PermissionCardSchema;
  onAction?: (action: PermissionCardSchema['actions'][keyof PermissionCardSchema['actions']]) => void;
}

export function PermissionCard({ schema, onAction }: PermissionCardProps) {
  const handleAllow = useCallback(() => {
    onAction?.(schema.actions.allow);
  }, [onAction, schema.actions.allow]);

  const handleAllowAlways = useCallback(() => {
    onAction?.(schema.actions.allowAlways);
  }, [onAction, schema.actions.allowAlways]);

  const handleDeny = useCallback(() => {
    onAction?.(schema.actions.deny);
  }, [onAction, schema.actions.deny]);

  const handleDenyAlways = useCallback(() => {
    onAction?.(schema.actions.denyAlways);
  }, [onAction, schema.actions.denyAlways]);

  if (!schema.isPending) {
    return (
      <div className="event-card permission-card permission-resolved">
        <div className="event-card-header">
          <span className="event-card-icon">✓</span>
          <span className="event-card-title">Permission Resolved</span>
          <span className="event-card-tool">{schema.toolName}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="event-card permission-card" data-tool-use-id={schema.toolUseId}>
      <div className="event-card-header">
        <span className="event-card-icon">⚠</span>
        <span className="event-card-title">Permission Required</span>
        <span className="event-card-sequence">#{schema.sequence}</span>
      </div>

      <div className="event-card-body">
        <p className="event-card-reason">{schema.reason}</p>
        {schema.inputSummary && (
          <div className="event-card-input">
            <code>{schema.inputSummary}</code>
          </div>
        )}
      </div>

      <div className="event-card-actions">
        <button
          type="button"
          className="event-card-btn event-card-btn-allow"
          onClick={handleAllow}
          data-action="allow"
          data-tool-use-id={schema.toolUseId}
        >
          Allow
        </button>
        <button
          type="button"
          className="event-card-btn event-card-btn-allow-always"
          onClick={handleAllowAlways}
          data-action="allow-always"
          data-tool-use-id={schema.toolUseId}
          data-tool-name={schema.toolName}
        >
          Always
        </button>
        <button
          type="button"
          className="event-card-btn event-card-btn-deny"
          onClick={handleDeny}
          data-action="deny"
          data-tool-use-id={schema.toolUseId}
        >
          Deny
        </button>
        <button
          type="button"
          className="event-card-btn event-card-btn-deny-always"
          onClick={handleDenyAlways}
          data-action="deny-always"
          data-tool-use-id={schema.toolUseId}
          data-tool-name={schema.toolName}
        >
          Never
        </button>
      </div>
    </div>
  );
}

interface ToolCardProps {
  schema: ToolCardSchema;
}

export function ToolCard({ schema }: ToolCardProps) {
  const statusIcon = {
    Started: '▶',
    InProgress: '⟳',
    Completed: '✓',
    Error: '✗',
  }[schema.status] || '?';

  const statusClass = schema.status.toLowerCase();

  return (
    <div
      className={`event-card tool-card tool-status-${statusClass}`}
      data-tool-use-id={schema.toolUseId}
      data-tool-status={schema.status}
    >
      <div className="event-card-header">
        <span className="event-card-icon">{statusIcon}</span>
        <span className="event-card-title">{schema.toolName}</span>
        <span className={`event-card-status event-card-status-${statusClass}`}>
          {schema.status}
        </span>
        <span className="event-card-timestamp">
          {new Date(schema.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      {(schema.inputSummary || schema.outputSummary || schema.error) && (
        <div className="event-card-body">
          {schema.inputSummary && (
            <div className="event-card-section">
              <span className="event-card-label">Input:</span>
              <code className="event-card-code">{schema.inputSummary}</code>
            </div>
          )}
          {schema.outputSummary && (
            <div className="event-card-section">
              <span className="event-card-label">Output:</span>
              <pre className="event-card-pre">{schema.outputSummary}</pre>
            </div>
          )}
          {schema.error && (
            <div className="event-card-section event-card-error">
              <span className="event-card-label">Error:</span>
              <span className="event-card-error-message">{schema.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PlanCardProps {
  schema: PlanCardSchema;
}

export function PlanCard({ schema }: PlanCardProps) {
  const progressPercent = schema.totalSteps > 0
    ? Math.round((schema.stepsCompleted / schema.totalSteps) * 100)
    : 0;

  const statusIcon = {
    pending: '○',
    'in-progress': '◐',
    completed: '●',
    failed: '◉',
  }[schema.status] || '○';

  return (
    <div
      className={`event-card plan-card plan-status-${schema.status}`}
      data-plan-id={schema.planId}
    >
      <div className="event-card-header">
        <span className="event-card-icon">{statusIcon}</span>
        <span className="event-card-title">{schema.title}</span>
        <span className={`event-card-badge event-card-badge-${schema.status}`}>
          {schema.status}
        </span>
      </div>

      {schema.description && (
        <div className="event-card-description">{schema.description}</div>
      )}

      <div className="event-card-progress">
        <div className="event-card-progress-bar">
          <div
            className="event-card-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="event-card-progress-text">
          {schema.stepsCompleted}/{schema.totalSteps}
        </span>
      </div>
    </div>
  );
}

interface StatusCardProps {
  schema: StatusCardSchema;
}

export function StatusCard({ schema }: StatusCardProps) {
  const severityIcon = {
    info: 'ℹ',
    warning: '⚠',
    error: '✗',
    success: '✓',
  }[schema.severity];

  return (
    <div
      className={`event-card status-card status-severity-${schema.severity}`}
      data-status-id={schema.statusId}
    >
      <div className="event-card-header">
        <span className="event-card-icon">{severityIcon}</span>
        <span className="event-card-title">{schema.label}</span>
        <span className={`event-card-badge event-card-badge-${schema.severity}`}>
          {schema.severity}
        </span>
      </div>

      {schema.description && (
        <div className="event-card-body">
          <p className="event-card-description">{schema.description}</p>
        </div>
      )}
    </div>
  );
}

interface UnknownCardProps {
  schema: UnknownCardSchema;
}

export function UnknownCard({ schema }: UnknownCardProps) {
  return (
    <div className="event-card unknown-card">
      <div className="event-card-header">
        <span className="event-card-icon">?</span>
        <span className="event-card-title">Unknown Event</span>
      </div>
      <div className="event-card-body">
        <p className="event-card-message">{schema.message}</p>
        {schema.originalData && (
          <details className="event-card-details">
            <summary>Debug Data</summary>
            <pre className="event-card-debug">
              {JSON.stringify(schema.originalData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export type EventCardSchema =
  | PermissionCardSchema
  | ToolCardSchema
  | PlanCardSchema
  | StatusCardSchema
  | UnknownCardSchema;

interface EventCardProps {
  schema: EventCardSchema;
  onPermissionAction?: (action: PermissionCardSchema['actions'][keyof PermissionCardSchema['actions']]) => void;
}

export function EventCard({ schema, onPermissionAction }: EventCardProps) {
  if (isPermissionCardSchema(schema)) {
    return <PermissionCard schema={schema} onAction={onPermissionAction} />;
  }

  if (isToolCardSchema(schema)) {
    return <ToolCard schema={schema} />;
  }

  if (isPlanCardSchema(schema)) {
    return <PlanCard schema={schema} />;
  }

  if (isStatusCardSchema(schema)) {
    return <StatusCard schema={schema} />;
  }

  if (isUnknownCardSchema(schema)) {
    return <UnknownCard schema={schema} />;
  }

  return <UnknownCard schema={{ type: 'unknown', message: 'Invalid schema', originalData: schema, sequence: 0 }} />;
}

interface EventContentPartProps {
  part: {
    type: string;
    name?: string;
    data?: unknown;
  };
  onPermissionAction?: (action: PermissionCardSchema['actions'][keyof PermissionCardSchema['actions']]) => void;
}

export function EventContentPart({ part, onPermissionAction }: EventContentPartProps) {
  if (part.type === 'data' && part.name === 'permission' && part.data) {
    const data = part.data as { toolUseId: string; toolName: string };
    const schema: PermissionCardSchema = {
      type: 'permission',
      toolUseId: data.toolUseId,
      toolName: data.toolName,
      reason: `The agent wants to use the ${data.toolName} tool`,
      inputSummary: '',
      isPending: true,
      sequence: 0,
      actions: {
        allow: { type: 'allow', toolUseId: data.toolUseId },
        allowAlways: { type: 'allow-always', toolUseId: data.toolUseId, toolName: data.toolName },
        deny: { type: 'deny', toolUseId: data.toolUseId },
        denyAlways: { type: 'deny-always', toolUseId: data.toolUseId, toolName: data.toolName },
      },
    };
    return <PermissionCard schema={schema} onAction={onPermissionAction} />;
  }

  if (part.type === 'tool-call') {
    const toolPart = part as {
      toolCallId: string;
      toolName: string;
      status?: string;
      result?: { result: string };
    };
    const schema: ToolCardSchema = {
      type: 'tool',
      toolUseId: toolPart.toolCallId,
      toolName: toolPart.toolName,
      status: (toolPart.status as 'Started' | 'InProgress' | 'Completed' | 'Error') || 'Started',
      outputSummary: toolPart.result?.result,
      updatedAt: Date.now(),
    };
    return <ToolCard schema={schema} />;
  }

  return <ContentPartPrimitive.Text />;
}
