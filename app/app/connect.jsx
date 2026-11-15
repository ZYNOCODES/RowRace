import { PhaseStub } from '../src/components/PhaseStub';

export default function Connect() {
  return (
    <PhaseStub
      titleKey="connect.title"
      phase={3}
      onBack={false}
      links={[
        { labelKey: 'connect.skip', href: '/home' },
        { labelKey: 'nav.diagnostics', href: '/diagnostics' },
      ]}
    />
  );
}
