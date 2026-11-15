import { PhaseStub } from '../../src/components/PhaseStub';

/** 3D race + HUD (phase 5 scene, phase 6 HUD). Also hosts Free Row via ?mode=free. */
export default function RaceRun() {
  return (
    <PhaseStub
      titleKey="nav.race"
      phase={5}
      links={[{ labelKey: 'nav.results', href: '/race/results' }]}
    />
  );
}
