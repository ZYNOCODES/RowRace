import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, Text } from '../src/components/ui';
import { ConnectionPanel } from '../src/components/diagnostics/ConnectionPanel';
import { PacketTable } from '../src/components/diagnostics/PacketTable';
import { LogActions } from '../src/components/diagnostics/LogActions';
import { DevPanel } from '../src/components/diagnostics/DevPanel';
import { useSettings } from '../src/state/settings';
import { useT } from '../src/i18n';
import { space } from '../src/theme/tokens';

/** Diagnostics: live link state, packet rates, raw packets, test-log tools. */
export default function Diagnostics() {
  const { t } = useT();
  const devMode = useSettings((s) => s.devMode);
  return (
    <Screen>
      <View style={styles.header}>
        <Button label={t('common.back')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="title">{t('nav.diagnostics')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <LogActions />
        <View style={styles.columns}>
          <View style={styles.col}>
            <ConnectionPanel />
            {devMode && <DevPanel />}
          </View>
          <View style={styles.col}>
            <PacketTable />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.md },
  content: { gap: space.lg, paddingBottom: space.xl },
  columns: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  col: { flex: 1, gap: space.lg },
});
