import React from 'react'
import type { AppNotification } from '@types'

interface NotificationsProps {
  notifications: AppNotification[]
  onRemove: (id: string) => void
}

export const Notifications: React.FC<NotificationsProps> = ({ notifications, onRemove }) => {
  return (
    <div className="notifications-container">
      {notifications.map(notification => (
        <div 
          key={notification.id} 
          className={`notification notification-${notification.type}`}
          onClick={() => onRemove(notification.id)}
        >
          <div className="notification-content">
            {notification.type === 'success' && '✅ '}
            {notification.type === 'error' && '❌ '}
            {notification.type === 'info' && 'ℹ️ '}
            {notification.type === 'warning' && '⚠️ '}
            {notification.message}
          </div>
          <button 
            className="notification-close"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(notification.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}