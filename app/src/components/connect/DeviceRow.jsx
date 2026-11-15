import { StyleSheet, View } from 'react-native';
import { Icon, PressableScale, Text } from '../ui';
import { useT } from '../../i18n';
import { colors, radius, space, touch } from '../../theme/tokens';

/** RSSI → 1..3 bars and a label (signal strength is shown with text too, not only color). */
export function signalLevel(rssi) {
  if (rssi == null) return { bars: 1, key: 'connect.signalWeak' };
  if (rssi >= -65) return { bars: 3, key: 'connect.signalStrong' };
  if (rssi >= -80) return { bars: 2, key: 'connect.signalOk' };
  return { bars: 1, key: 'connect.signalWeak' };
}

/** @param {{ device: import('../../data/scanner').FoundDevice, onPress: () => void, last?: boolean }} props */
export function DeviceRow({ device, onPress, last }) {
  const { t } = useT();
  const sig = signalLevel(device.rssi);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${device.name}, ${t(sig.key)}`}
      onPress={onPress}
      scaleTo={0.98}
      style={[styles.row, last && styles.last]}
    >
      <Icon name="bluetooth" size={28} color={colors.primary} />
      <View style={styles.text}>
        <Text variant="heading">{device.name}</Text>
        <Text variant="bodySecondary">
          {t('connect.serial')} {device.serial ?? '—'} · {t(sig.key)}
        </Text>
      </View>
      <View style={styles.bars}>
        {[1, 2, 3].map((b) => (
          <View
            key={b}
            style={[
              styles.bar,
              {
                height: 8 + b * 8,
                backgroundColor: b <= sig.bars ? colors.primary : colors.divider,
              },
            ]}
          />
        ))}
      </View>
      <Icon name="chevronRight" size={28} color={colors.textSecondary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.min + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  last: { borderColor: colors.primary },
  text: { flex: 1, gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 6, borderRadius: 2 },
});
