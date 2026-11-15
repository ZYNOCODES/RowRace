import { PhaseStub } from '../../src/components/PhaseStub';

export default function ChooseMap() {
  return (
    <PhaseStub
      titleKey="nav.chooseMap"
      phase={6}
      links={[{ labelKey: 'nav.chooseWorkout', href: '/race/workout' }]}
    />
  );
}
