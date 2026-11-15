import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ErgMachineType } from '@rowrace/shared';
import { Button, Icon, Pill, Screen, Text } from '../src/components/ui';
import { StateCard } from '../src/components/StateCard';
import { PM5Illustration } from '../src/components/connect/PM5Illustration';
import { DeviceRow } from '../src/components/connect/DeviceRow';
import { useConnectFlow } from '../src/data/useConnectFlow';
import { openAppSettings, openBluetoothSettings } from '../src/data/permissions';
import { pillFor, useConnection } from '../src/state/connection';
import { useSettings } from '../src/state/settings';
import { useT } from '../src/i18n';
import { colors, space } from '../src/theme/tokens';

const AUTO_CONTINUE_MS = 1500;

export default function Connect() {
  const { t } = useT();
  const f = useConnectFlow();
  const devMode = useSettings((s) => s.devMode);
  const warning = useConnection((s) => s.warning);
  const pill = pillFor(f.conn.status);

  // Auto-skip to Home once connected (unless there is a warning to read).
  useEffect(() => {
    if (f.phase !== 'connected' || warning) return undefined;
    const id = setTimeout(() => router.replace('/home'), AUTO_CONTINUE_MS);
    return () => clearTimeout(id);
  }, [f.phase, warning]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title">{t('connect.title')}</Text>
        <View style={styles.headerRight}>
          <Pill tone={pill.tone} icon={pill.icon} label={t(pill.key)} />
          <Button
            label={t('nav.diagnostics')}
            variant="ghost"
            size="md"
            onPress={() => router.push('/diagnostics')}
          />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.left}>
          <PM5Illustration width={240} />
          <View style={styles.steps}>
            {['connect.step1', 'connect.step2', 'connect.step3'].map((k, i) => (
              <View key={k} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text variant="button" color={colors.onFill}>
                    {i + 1}
                  </Text>
                </View>
                <Text variant="body" style={styles.flex}>
                  {t(k)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <ScrollView style={styles.right} contentContainerStyle={styles.rightContent}>
          <PhaseContent f={f} t={t} warning={warning} />
          <View style={styles.footer}>
            {devMode && f.dataSource === 'ble' && f.phase !== 'unavailable' && (
              <Button
                label={t('connect.useSimulator')}
                variant="secondary"
                onPress={() => useSettings.getState().set({ dataSource: 'mock' })}
              />
            )}
            <Button
              label={t('connect.skip')}
              variant="ghost"
              onPress={() => router.replace('/home')}
            />
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

function PhaseContent({ f, t, warning }) {
  switch (f.phase) {
    case 'source':
      return (
        <StateCard
          icon="wave"
          title={t('connect.title')}
          message={t(f.dataSource === 'mock' ? 'connect.sourceMock' : 'connect.sourceReplay')}
          actions={[{ label: t('connect.startSource'), onPress: f.startNonBle }]}
        />
      );
    case 'unavailable': {
      const expoGo = f.bleUnavailableReason === 'expo-go';
      return (
        <StateCard
          icon="bluetooth"
          tone="warning"
          title={t(expoGo ? 'bluetooth.expoGoTitle' : 'bluetooth.noModuleTitle')}
          message={t(expoGo ? 'bluetooth.expoGo' : 'bluetooth.noModule')}
          actions={[
            {
              label: t('connect.useSimulator'),
              onPress: () => useSettings.getState().set({ dataSource: 'mock' }),
            },
          ]}
        />
      );
    }
    case 'checking':
      return <ActivityIndicator size="large" color={colors.primary} />;
    case 'permission':
      return <PermissionCard f={f} t={t} />;
    case 'bluetooth':
      return f.btState === 'Unsupported' ? (
        <StateCard
          icon="warning"
          tone="danger"
          title={t('connect.failed')}
          message={t('bluetooth.unsupported')}
        />
      ) : (
        <StateCard
          icon="bluetooth"
          tone="warning"
          title={t('bluetooth.offTitle')}
          message={t('bluetooth.off')}
          actions={[{ label: t('bluetooth.openSettings'), onPress: openBluetoothSettings }]}
        />
      );
    case 'scanning':
    case 'timeout':
      return <DeviceList f={f} t={t} />;
    case 'connecting':
      return <ConnectingCard f={f} t={t} />;
    case 'connected':
      return <ConnectedCard f={f} t={t} warning={warning} />;
    default:
      return null;
  }
}

function PermissionCard({ f, t }) {
  if (f.permStatus === 'blocked') {
    return (
      <StateCard
        icon="bluetooth"
        tone="danger"
        title={t('permissions.blockedTitle')}
        message={t('permissions.blocked')}
        actions={[{ label: t('permissions.openSettings'), onPress: openAppSettings }]}
      />
    );
  }
  const denied = f.permStatus === 'denied';
  return (
    <StateCard
      icon="bluetooth"
      tone={denied ? 'warning' : 'info'}
      title={t(denied ? 'permissions.deniedTitle' : 'permissions.title')}
      message={denied ? t('permissions.denied') : t('permissions.why')}
      tips={f.legacyAndroid ? [t('permissions.whyLegacy')] : undefined}
      actions={[
        { label: t(denied ? 'common.retry' : 'permissions.allow'), onPress: f.requestPermission },
        ...(denied ? [{ label: t('permissions.openSettings'), onPress: openAppSettings }] : []),
      ]}
    />
  );
}

function DeviceList({ f, t }) {
  const { devices, phase } = f;
  if (phase === 'timeout' && devices.length === 0) {
    return (
      <StateCard
        icon="bluetooth"
        tone="warning"
        title={t('connect.noneTitle')}
        tips={[t('connect.tipConnectScreen'), t('connect.tipOtherApp'), t('connect.tipCloser')]}
        actions={[{ label: t('connect.scanAgain'), onPress: f.startScan }]}
      />
    );
  }
  return (
    <View style={styles.list}>
      <View style={styles.listHead}>
        {phase === 'scanning' && <ActivityIndicator color={colors.primary} />}
        <Text variant="heading">
          {devices.length ? t('connect.found', { count: devices.length }) : t('connect.searching')}
        </Text>
      </View>
      {devices.map((d) => (
        <DeviceRow
          key={d.id}
          device={d}
          last={d.id === f.lastDeviceId}
          onPress={() => f.connect(d)}
        />
      ))}
      {phase === 'timeout' && (
        <Button label={t('connect.scanAgain')} variant="secondary" onPress={f.startScan} />
      )}
    </View>
  );
}

function ConnectingCard({ f, t }) {
  const name = f.target?.name || f.conn.info?.name || 'PM5';
  const retrying = f.conn.status === 'reconnecting';
  const seconds = f.conn.detail?.nextRetryMs ? Math.round(f.conn.detail.nextRetryMs / 1000) : null;
  return (
    <StateCard
      icon="bluetooth"
      title={t(retrying ? 'connect.reconnectingTo' : 'connect.connectingTo', { name })}
      message={retrying && seconds ? t('connect.retryIn', { seconds }) : undefined}
      tips={retrying ? [t('connect.tipConnectScreen'), t('connect.tipOtherApp')] : undefined}
      actions={
        f.dataSource === 'ble'
          ? [{ label: t('connect.chooseAnother'), onPress: f.chooseAnother, variant: 'secondary' }]
          : []
      }
    >
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
    </StateCard>
  );
}

function ConnectedCard({ f, t, warning }) {
  const info = f.conn.info || {};
  return (
    <StateCard
      icon="check"
      tone="success"
      title={`${t('connect.connected')} · ${info.name ?? 'PM5'}`}
      actions={[{ label: t('common.continue'), onPress: () => router.replace('/home') }]}
    >
      <View style={styles.infoRow}>
        <Text variant="body">
          {t('connect.serial')}: <Text variant="mono">{info.serialNumber ?? '—'}</Text>
        </Text>
        <Text variant="body">
          {t('connect.firmware')}: <Text variant="mono">{info.firmwareRevision ?? '—'}</Text>
        </Text>
      </View>
      {warning?.code === 'wrong-erg' && (
        <View style={styles.warning}>
          <Icon name="warning" color={colors.warning} />
          <Text variant="body" style={styles.flex}>
            {t('connect.wrongErg', {
              type: warning.message || ErgMachineType.label(info.ergMachineType),
            })}
          </Text>
        </View>
      )}
    </StateCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { flex: 1, flexDirection: 'row', gap: space.xl },
  left: { width: 340, alignItems: 'center', gap: space.lg },
  steps: { gap: space.sm, alignSelf: 'stretch' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  right: { flex: 1 },
  rightContent: { gap: space.lg, paddingBottom: space.lg },
  list: { gap: space.sm },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  footer: { flexDirection: 'row', gap: space.md, justifyContent: 'flex-end', flexWrap: 'wrap' },
  spinner: { alignSelf: 'flex-start' },
  infoRow: { flexDirection: 'row', gap: space.xl, flexWrap: 'wrap' },
  warning: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
});
