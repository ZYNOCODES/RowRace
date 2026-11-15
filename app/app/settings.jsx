import { PhaseStub } from '../src/components/PhaseStub';

export default function Settings() {
  return (
    <PhaseStub
      titleKey="nav.settings"
      phase={6}
      links={[{ labelKey: 'nav.diagnostics', href: '/diagnostics' }]}
    />
  );
}
