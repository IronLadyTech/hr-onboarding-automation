import React, { useEffect, useState } from 'react';
import { configApi } from '../services/api';

const ThemeProvider = ({ children }) => {
  const [colorsLoaded, setColorsLoaded] = useState(false);

  useEffect(() => {
    const applyThemeColors = async () => {
      try {
        const response = await configApi.getSettings();
        if (response.data?.success) {
          const settings = response.data.data;
          const root = document.documentElement;
          
          // Apply primary color
          if (settings.uiPrimaryColor) {
            root.style.setProperty('--color-primary', settings.uiPrimaryColor);
            // Generate lighter/darker shades
            root.style.setProperty('--color-primary-light', lightenColor(settings.uiPrimaryColor, 20));
            root.style.setProperty('--color-primary-dark', darkenColor(settings.uiPrimaryColor, 20));
          }
          
          // Apply secondary color
          if (settings.uiSecondaryColor) {
            root.style.setProperty('--color-secondary', settings.uiSecondaryColor);
            root.style.setProperty('--color-secondary-light', lightenColor(settings.uiSecondaryColor, 20));
            root.style.setProperty('--color-secondary-dark', darkenColor(settings.uiSecondaryColor, 20));
          }
          
          // Apply accent color (optional)
          if (settings.uiAccentColor) {
            root.style.setProperty('--color-accent', settings.uiAccentColor);
          }
        }
      } catch (error) {
        console.error('Failed to load theme colors:', error);
      } finally {
        setColorsLoaded(true);
      }
    };

    applyThemeColors();
  }, []);

  // Helper function to lighten a hex color
  const lightenColor = (hex, percent) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  // Helper function to darken a hex color
  const darkenColor = (hex, percent) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - percent);
    const b = Math.max(0, (num & 0x0000FF) - percent);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  return <>{children}</>;
};

export default ThemeProvider;

