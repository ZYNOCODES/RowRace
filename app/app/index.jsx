import { Redirect } from 'expo-router';
import { useSettings } from '../src/state/settings';

/** Entry: first launch goes through onboarding, afterwards straight to Connect. */
export default function Index() {
  const onboardingDone = useSettings((s) => s.onboardingDone);
  return <Redirect href={onboardingDone ? '/connect' : '/onboarding'} />;
}
