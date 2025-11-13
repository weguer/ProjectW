import React, { useState, useEffect } from 'react';
import { APP_ICON_URL } from '@shared/icons';

const CustomTitleBar: React.FC = () => {
  const [iconError, setIconError] = useState(false);
  
  const handleMinimize = () => {
    window.api.minimizeWindow();
  };

  const handleMaximize = () => {
    window.api.maximizeWindow();
  };

  const handleClose = () => {
    window.api.closeWindow();
  };

  const handleIconError = () => {
    setIconError(true);
  };

  return (
    <div className="custom-title-bar">
      <div className="title-bar-drag-region"></div>
      <div className="title-bar-content">
        <div className="title-bar-left">
          {!iconError ? (
            <img 
              src={APP_ICON_URL}
              alt="App Icon" 
              className="title-bar-icon" 
              onError={handleIconError}
            />
          ) : (
            <div className="title-bar-icon-fallback">P</div>
          )}
          <span className="title-bar-title">Project W - Game Save Backup & Restore</span>
        </div>
        <div className="title-bar-right">
          <button className="title-bar-button minimize" onClick={handleMinimize}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M0 6h12v1H0z" fill="currentColor" />
            </svg>
          </button>
          <button className="title-bar-button maximize" onClick={handleMaximize}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M1 1h10v10H1V1zm1 1v8h8V2H2z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.5"
              />
            </svg>
          </button>
          <button className="title-bar-button close" onClick={handleClose}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M6 4.586L1.707.293A1 1 0 10.293 1.707L4.586 6 .293 10.293a1 1 0 101.414 1.414L6 7.414l4.293 4.293a1 1 0 101.414-1.414L7.414 6l4.293-4.293A1 1 0 1010.293.293L6 4.586z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomTitleBar;