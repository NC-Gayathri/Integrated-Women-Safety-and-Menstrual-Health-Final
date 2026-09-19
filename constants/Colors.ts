/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#8e24aa';
const tintColorDark = '#ff80ab';

export const Colors = {
  light: {
    text: '#1C0D2B',
    subtext: '#6E5A80',
    background: '#F8FAFC',
    tint: tintColorLight,
    icon: '#7b1fa2',
    tabIconDefault: '#9c88b0',
    tabIconSelected: tintColorLight,
    cardBackground: '#ffffff',
    cardBorder: 'rgba(142, 36, 170, 0.08)',
    primaryGradient: ['#ab47bc', '#8e24aa', '#6a1b9a'],
    safetyGradient: ['#ff5252', '#d50000'],
    menstrualGradient: ['#f48fb1', '#c2185b'],
  },
  dark: {
    text: '#f3e5f5',
    subtext: '#d1c4e9',
    background: '#12071a',
    tint: tintColorDark,
    icon: '#ce93d8',
    tabIconDefault: '#6a517d',
    tabIconSelected: tintColorDark,
    cardBackground: 'rgba(32, 14, 46, 0.95)',
    cardBorder: 'rgba(255, 128, 171, 0.2)',
    primaryGradient: ['#7b1fa2', '#4a148c'],
    safetyGradient: ['#ff1744', '#b71c1c'],
    menstrualGradient: ['#ad1457', '#880e4f'],
  },
};

