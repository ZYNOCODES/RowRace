import { StyleSheet, View } from 'react-native';
import { GlassPanel, Icon, Text } from '../ui';
import { useT } from '../../i18n';
import { colors, space } from '../../theme/tokens';

const boatName = (b, t) => (b.id === 'ghost' ? t('hud.pb') : b.name);

/** Gap to the boat ahead and behind, in meters (and seconds when moving). */
export function GapPanel({ ahead, behind }) {
  const { t } = useT();
  if (!ahead && !behind) return null;
  const row = (b, up) => (
    <View style={styles.row} key={up ? 'a' : 'b'}>
      <Icon
        name={up ? 'chevronUp' : 'chevronDown'}
        size={22}
        color={up ? colors.danger : colors.success}
        strokeWidth={3}
      />
      <Text variant="body" style={styles.name} numberOfLines={1}>
        {boatName(b, t)}
      </Text>
      <Text variant="statSm">{`${up ? '+' : '−'}${Math.round(b.meters)} m`}</Text>
      {b.seconds != null && <Text variant="bodySecondary">{`${b.seconds.toFixed(1)} s`}</Text>}
    </View>
  );
  return (
    <GlassPanel strong style={styles.panel}>
      {ahead && row(ahead, true)}
      {behind && row(behind, false)}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.xxs, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { minWidth: 56 },
});
