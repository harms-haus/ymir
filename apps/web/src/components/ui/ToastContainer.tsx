import React from 'react';
import { Toast } from './Toast';
import { useToastStore } from '../../store';

export const ToastContainer: React.FC = () => {
  const notifications = useToastStore((state) => state.notifications);
  const removeNotification = useToastStore((state) => state.removeNotification);

  const visibleNotifications = notifications.slice(-5);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    >
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          style={{
            marginBottom: '8px',
            pointerEvents: 'auto'
          }}
        >
          <Toast
            variant={notification.variant}
            title={notification.title}
            description={notification.description}
            duration={notification.duration}
            onClose={() => removeNotification(notification.id)}
          />
        </div>
      ))}
    </div>
  );
};
