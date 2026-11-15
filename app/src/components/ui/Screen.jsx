import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../../theme/tokens';
import { useT } from '../../i18n';

/**
 * Full-screen container for menu screens: dark background, safe areas, 8-pt padding.
 * Menus flip to right-to-left for Arabic; the race HUD does not use Screen and stays fixed.
 */
export function Screen({ children, style, padded = true }) {
  const { isRTL } = useT();
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'top', 'bottom']}>
      <View
        style={[styles.inner, { direction: isRTL ? 'rtl' : 'ltr' }, padded && styles.padded, style]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1 },
  padded: { paddingHorizontal: space.xl, paddingVertical: space.lg },
});
