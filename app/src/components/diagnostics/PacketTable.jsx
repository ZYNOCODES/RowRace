import { memo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Card, Icon, Text } from '../ui';
import { useConnection } from '../../state/connection';
import { useT } from '../../i18n';
import { colors, space } from '../../theme/tokens';

/** Short human summary of a decoded packet for the live table. */
export function summarize(p) {
  if (!p.ok) return p.error;
  const d = p.decoded;
  switch (d.type) {
    case 'generalStatus':
      return `t=${d.elapsed.toFixed(2)}s d=${d.distance.toFixed(1)}m stroke=${d.strokeState} row=${d.rowingState} wk=${d.workoutState} df=${d.dragFactor}`;
    case 'additionalStatus1':
      return `v=${d.speed.toFixed(3)}m/s spm=${d.strokeRate} hr=${d.heartRate ?? '—'} pace=${d.currentPace?.toFixed(1) ?? '—'}`;
    case 'additionalStatus2':
      return `cal=${d.totalCalories} avgW=${d.averagePower ?? '—'} split=${d.lastSplitDistance}m/${d.lastSplitTime}s`;
    case 'strokeData':
      return `#${d.strokeCount} drive=${d.driveTime}s/${d.driveLength}m rec=${d.recoveryTime}s`;
    case 'additionalStrokeData':
      return `#${d.strokeCount} ${d.strokePower}W ${d.strokeCalories}cal/h`;
    default:
      return d.type;
  }
}

const Row = memo(function Row({ p }) {
  const time = new Date(p.t).toISOString().slice(11, 23);
  return (
    <View style={styles.row}>
      <Icon
        name={p.ok ? 'check' : 'warning'}
        size={16}
        color={p.ok ? colors.success : colors.danger}
      />
      <Text variant="mono" color={colors.textSecondary} style={styles.time}>
        {time}
      </Text>
      <Text variant="mono" style={styles.char}>
        {p.char}
      </Text>
      <View style={styles.flex}>
        <Text variant="mono" numberOfLines={1}>
          {summarize(p)}
        </Text>
        <Text variant="mono" color={colors.textSecondary} numberOfLines={1} style={styles.hex}>
          {p.hex}
        </Text>
      </View>
    </View>
  );
});

/** Live scrolling table: newest packet on top, decoded values plus raw hex. */
export function PacketTable() {
  const { t } = useT();
  const packets = useConnection((s) => s.recentPackets);
  return (
    <Card style={styles.card}>
      <Text variant="heading">{t('diagnostics.live')}</Text>
      {packets.length === 0 ? (
        <Text variant="bodySecondary">{t('diagnostics.noPackets')}</Text>
      ) : (
        <FlatList
          data={packets}
          keyExtractor={(p, i) => `${p.t}-${p.char}-${i}`}
          renderItem={({ item }) => <Row p={item} />}
          scrollEnabled={false}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  time: { width: 100 },
  char: { width: 64 },
  flex: { flex: 1 },
  hex: { fontSize: 11 },
});
