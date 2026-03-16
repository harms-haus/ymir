import React, { useCallback, useEffect, useState } from 'react';
import { Close } from '@mui/icons-material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

export type ToastVariant = 'error' | 'success' | 'info';

export interface ToastProps {
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
  onClose: () => void;
}

const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: React.ReactNode }> = {
  error: {
    bg: 'var(--destructive)',
    border: '#dc2626',
    icon: <ErrorOutlineIcon />
  },
  success: {
    bg: 'var(--primary)',
    border: '#16a34a',
    icon: <CheckCircleOutlineIcon />
  },
  info: {
    bg: 'var(--muted)',
    border: '#2563eb',
    icon: <InfoOutlinedIcon />
  }
};

const getDuration = (variant: ToastVariant, duration?: number): number => {
  if (duration !== undefined) return duration;
  return variant === 'error' ? 5000 : 3000;
};

export const Toast: React.FC<ToastProps> = ({ variant, title, description, onClose, duration: propDuration }) => {
  const [isExiting, setIsExiting] = useState(false);
  const duration = getDuration(variant, propDuration);
  const styles = variantStyles[variant];

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(handleDismiss, duration);

    return () => clearTimeout(timer);
  }, [duration, handleDismiss]);

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        minWidth: '300px',
        maxWidth: '400px',
        backgroundColor: styles.bg,
        borderLeft: `4px solid ${styles.border}`,
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        zIndex: 9999,
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'translateX(100%)' : 'translateX(0)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        animation: isExiting ? 'none' : 'slideIn 0.3s ease-out',
        color: variant === 'error' ? 'white' : 'inherit'
      }}
    >
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      
      <div style={{ fontSize: '24px', flexShrink: 0, marginTop: '-2px' }}>
        {styles.icon}
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600,
          fontSize: '14px',
          marginBottom: description ? '4px' : 0,
          color: variant === 'error' ? 'white' : 'inherit'
        }}>
          {title}
        </div>
        {description && (
          <div style={{
            fontSize: '13px',
            color: variant === 'error' ? 'rgba(255, 255, 255, 0.9)' : 'inherit',
            opacity: 0.9,
            lineHeight: 1.4
          }}>
            {description}
          </div>
        )}
      </div>
      
      <button
        onClick={handleDismiss}
        type="button"
        style={{
          background: 'transparent',
          border: 'none',
          color: variant === 'error' ? 'white' : 'inherit',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        aria-label="Close toast"
      >
        <Close fontSize="small" />
      </button>
    </div>
  );
};
