import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Button, Card, Chip, SegmentedControl, Text } from '../ui';
import { MOCK_SCENARIOS } from '../../data/mockPM5';
import { logger, sourceManager } from '../../services';
import { useSettings } from '../../state/settings';
import { useT } from '../../i18n';
import { colors, space } from '../../theme/tokens';

const DEMO_LOG = require('../../../assets/fixtures/demo-session.jsonl');

/** Developer options (7 taps on the version number): data source, scenario, replay file. */
export function DevPanel() {
  const { t } = useT();
  const dataSource = useSettings((s) => s.dataSource);
  const [scenario, setScenario] = useState('steady');
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(null); // { name, text }
  const [error, setError] = useState(null);

  const setSource = (v) => useSettings.getState().set({ dataSource: v });

  const loadDemo = async () => {
    const asset = Asset.fromModule(DEMO_LOG);
    await asset.downloadAsync();
    setReplay({ name: 'demo-session', text: await new File(asset.localUri).text() });
  };

  const pickFile = async () => {
    setError(null);
    try {
      const picked = await File.pickFileAsync();
      const file = Array.isArray(picked) ? picked[0] : (picked?.result ?? picked);
      if (!file?.uri) return;
      setReplay({ name: file.name, text: await file.text() });
    } catch (e) {
      if (!/cancel/i.test(String(e?.message))) setError(String(e?.message || e));
    }
  };

  const apply = async () => {
    setError(null);
    logger.ui('dev.apply', { dataSource, scenario, speed, replay: replay?.name });
    if (dataSource === 'mock') await sourceManager.use('mock', { scenario });
    else if (dataSource === 'replay') {
      if (!replay) return setError(t('diagnostics.replayFile'));
      await sourceManager.use('replay', { text: replay.text, name: replay.name, speed });
    } else {
      await sourceManager.stop();
    }
  };

  return (
    <Card style={styles.card}>
      <Text variant="heading">{t('diagnostics.dev')}</Text>
      <Text variant="label">{t('diagnostics.dataSource')}</Text>
      <SegmentedControl
        value={dataSource}
        onChange={setSource}
        options={[
          { value: 'ble', label: t('diagnostics.sourceBle') },
          { value: 'mock', label: t('diagnostics.sourceMock') },
          { value: 'replay', label: t('diagnostics.sourceReplay') },
        ]}
      />
      {dataSource === 'mock' && (
        <>
          <Text variant="label">{t('diagnostics.scenario')}</Text>
          <View style={styles.wrap}>
            {MOCK_SCENARIOS.map((s) => (
              <Chip
                key={s}
                label={t(`scenario.${s}`)}
                selected={s === scenario}
                onPress={() => setScenario(s)}
              />
            ))}
          </View>
        </>
      )}
      {dataSource === 'replay' && (
        <>
          <View style={styles.wrap}>
            <Button label={t('diagnostics.replayDemo')} variant="secondary" onPress={loadDemo} />
            <Button label={t('diagnostics.replayFile')} variant="secondary" onPress={pickFile} />
            {replay && <Text variant="mono">{replay.name}</Text>}
          </View>
          <Text variant="label">{t('diagnostics.replaySpeed')}</Text>
          <View style={styles.wrap}>
            {[1, 2, 4].map((x) => (
              <Chip key={x} label={`×${x}`} selected={speed === x} onPress={() => setSpeed(x)} />
            ))}
          </View>
        </>
      )}
      {error && (
        <Text variant="body" color={colors.danger}>
          {error}
        </Text>
      )}
      <View style={styles.wrap}>
        <Button
          label={dataSource === 'ble' ? t('diagnostics.disconnect') : t('diagnostics.apply')}
          onPress={apply}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
});
