import React, { useEffect } from 'react';
import { configApi } from '../services/api';

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

const ThemeProvider = ({ children }) => {
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
          } else {
            // Default colors
            root.style.setProperty('--color-primary', '#4F46E5');
            root.style.setProperty('--color-primary-light', '#6366F1');
            root.style.setProperty('--color-primary-dark', '#4338CA');
          }
          
          // Apply secondary color
          if (settings.uiSecondaryColor) {
            root.style.setProperty('--color-secondary', settings.uiSecondaryColor);
            root.style.setProperty('--color-secondary-light', lightenColor(settings.uiSecondaryColor, 20));
            root.style.setProperty('--color-secondary-dark', darkenColor(settings.uiSecondaryColor, 20));
          } else {
            root.style.setProperty('--color-secondary', '#7C3AED');
            root.style.setProperty('--color-secondary-light', '#8B5CF6');
            root.style.setProperty('--color-secondary-dark', '#6D28D9');
          }
          
          // Apply accent color (optional)
          if (settings.uiAccentColor) {
            root.style.setProperty('--color-accent', settings.uiAccentColor);
          }
        }
      } catch (error) {
        console.error('Failed to load theme colors:', error);
        // Set defaults on error
        const root = document.documentElement;
        root.style.setProperty('--color-primary', '#4F46E5');
        root.style.setProperty('--color-primary-dark', '#4338CA');
        root.style.setProperty('--color-secondary', '#7C3AED');
      }
    };

    applyThemeColors();
  }, []);

  return <>{children}</>;
};

export default ThemeProvider;

