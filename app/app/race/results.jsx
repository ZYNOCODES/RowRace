import { PhaseStub } from '../../src/components/PhaseStub';

export default function Results() {
  return (
    <PhaseStub titleKey="nav.results" phase={6} links={[{ labelKey: 'nav.home', href: '/home' }]} />
  );
}
