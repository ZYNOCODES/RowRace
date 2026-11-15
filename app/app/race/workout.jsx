import { PhaseStub } from '../../src/components/PhaseStub';

export default function ChooseWorkout() {
  return (
    <PhaseStub
      titleKey="nav.chooseWorkout"
      phase={6}
      links={[{ labelKey: 'nav.ready', href: '/race/ready' }]}
    />
  );
}
