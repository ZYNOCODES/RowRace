import { StyleSheet, View } from 'react-native';
import { Gauge, Icon, Text } from '../ui';
import { useT } from '../../i18n';
import { colors } from '../../theme/tokens';
import { ordinal } from '../../race/records';

const km = (m) => (m / 1000).toFixed(m < 10000 ? 1 : 0);

/**
 * Circular mini-map: progress ring, "0.4 / 2.0 km" and rank "1st / 4".
 * @param {{ distance: number, length: number|null, rank?: number, total?: number, size?: number }} props
 */
export function MiniMap({ distance, length, rank, total, size = 170 }) {
  const { t, lang } = useT();
  const progress = length ? distance / length : 0;
  return (
    <View style={styles.wrap}>
      <Text variant="statSm" style={styles.km}>
        {length ? `${km(distance)} / ${km(length)} km` : `${km(distance)} km`}
      </Text>
      <Gauge size={size} thickness={12} progress={progress} color={colors.primary}>
        {rank && total > 1 ? (
          <>
            <Text variant="stat" accessibilityLabel={t('hud.rankA11y', { rank, total })}>
              {ordinal(rank, lang)}
            </Text>
            <Text variant="bodySecondary">/ {total}</Text>
          </>
        ) : (
          <Icon name="flag" size={44} color={colors.primary} />
        )}
      </Gauge>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  km: { marginBottom: -6 },
});
