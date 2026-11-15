import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Modal, Screen } from '../../src/components/ui';
import { StateCard } from '../../src/components/StateCard';
import { ResultsView } from '../../src/components/ResultsView';
import { useHistory } from '../../src/state/history';
import { useT } from '../../src/i18n';
import { space } from '../../src/theme/tokens';

export default function HistoryDetail() {
  const { t } = useT();
  const { id } = useLocalSearchParams();
  const entry = useHistory((s) => s.entries.find((e) => e.id === id));
  const [confirm, setConfirm] = useState(false);
  if (!entry) {
    return (
      <Screen>
        <StateCard
          icon="warning"
          tone="warning"
          title={t('results.missing')}
          actions={[{ label: t('common.back'), onPress: () => router.back() }]}
        />
      </Screen>
    );
  }
  return (
    <Screen>
      <ResultsView
        entry={entry}
        isPB={entry.isPB}
        header={
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button label={t('history.delete')} variant="ghost" onPress={() => setConfirm(true)} />
            <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          </View>
        }
      />
      <Modal
        visible={confirm}
        title={t('history.deleteTitle')}
        message={t('history.deleteMessage')}
        onRequestClose={() => setConfirm(false)}
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirm(false) },
          {
            label: t('history.delete'),
            variant: 'danger',
            onPress: () => {
              useHistory.getState().remove(entry.id);
              router.back();
            },
          },
        ]}
      />
    </Screen>
  );
}
