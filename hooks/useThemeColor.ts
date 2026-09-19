import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

type StringColorNames = {
  [K in keyof typeof Colors.light & keyof typeof Colors.dark]: typeof Colors.light[K] extends string ? K : never;
}[keyof typeof Colors.light & keyof typeof Colors.dark];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: StringColorNames
): string {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName] as string;
  }
}
