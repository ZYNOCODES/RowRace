import { PhaseStub } from '../../src/components/PhaseStub';

export default function Ready() {
  return (
    <PhaseStub
      titleKey="nav.ready"
      phase={6}
      links={[{ labelKey: 'nav.race', href: '/race/run' }]}
    />
  );
}
