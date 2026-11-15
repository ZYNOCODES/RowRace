import { StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { ErgMachineType, NOTIFY_CHARACTERISTICS, shortIdLabel } from '@rowrace/shared';
import { Card, Pill, Text } from '../ui';
import { pillFor, useConnection } from '../../state/connection';
import { useT } from '../../i18n';
import { getBleSupport } from '../../data/bleSupport';
import { colors, space } from '../../theme/tokens';

const SOURCE_KEY = {
  ble: 'diagnostics.sourceBle',
  mock: 'diagnostics.sourceMock',
  replay: 'diagnostics.sourceReplay',
};

/** Connection state, device identity, signal, sample rate, packet rates. */
export function ConnectionPanel() {
  const { t } = useT();
  const c = useConnection(
    useShallow((s) => ({
      kind: s.kind,
      status: s.status,
      detail: s.statusDetail,
      info: s.deviceInfo,
      rates: s.rates,
      stats: s.stats,
    })),
  );
  const pill = pillFor(c.status);
  const info = c.info || {};
  const rows = [
    [t('diagnostics.source'), c.kind ? t(SOURCE_KEY[c.kind]) : '—'],
    [t('diagnostics.device'), info.name ?? '—'],
    [t('diagnostics.serial'), info.serialNumber ?? '—'],
    [t('diagnostics.firmware'), info.firmwareRevision ?? '—'],
    [t('diagnostics.hardware'), info.hardwareRevision ?? '—'],
    [
      t('diagnostics.ergType'),
      info.ergMachineType != null ? ErgMachineType.label(info.ergMachineType) : '—',
    ],
    [t('diagnostics.rssi'), info.rssi != null ? `${info.rssi} dBm` : '—'],
    [t('diagnostics.sampleRate'), info.sampleRateMs ? `${info.sampleRateMs} ms` : '—'],
    [t('diagnostics.packets'), c.stats ? String(c.stats.packets) : '0'],
    [t('diagnostics.errors'), c.stats ? String(c.stats.errors) : '0'],
  ];
  const detail = Object.entries(c.detail || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="heading">{t('diagnostics.connection')}</Text>
        <Pill tone={pill.tone} icon={pill.icon} label={`${t(pill.key)} (${c.status})`} />
      </View>
      {!getBleSupport().ok && (
        <Text variant="body" color={colors.warning}>
          {t(
            getBleSupport().reason === 'expo-go'
              ? 'bluetooth.expoGoTitle'
              : 'bluetooth.noModuleTitle',
          )}
        </Text>
      )}
      {detail ? (
        <Text variant="mono" color={colors.textSecondary}>
          {detail}
        </Text>
      ) : null}
      <View style={styles.grid}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.cell}>
            <Text variant="label">{k}</Text>
            <Text variant="mono" style={styles.value}>
              {v}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="label">{t('diagnostics.perSecond')}</Text>
      <View style={styles.rates}>
        {[...NOTIFY_CHARACTERISTICS, 0x80].map((id) => {
          const char = shortIdLabel(id);
          const r = c.rates?.[char] ?? 0;
          return (
            <View key={char} style={styles.rate}>
              <Text variant="mono" color={colors.textSecondary}>
                {char}
              </Text>
              <Text variant="statSm" color={r > 0 ? colors.text : colors.textSecondary}>
                {r.toFixed(1)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
  cell: { width: '33%', paddingRight: space.sm, gap: 2 },
  value: { fontSize: 16 },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  rate: { alignItems: 'center', minWidth: 72 },
});
