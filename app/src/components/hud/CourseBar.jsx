import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

/**
 * Thin course progress bar with every boat as a dot (the user's is larger, ringed).
 * @param {{ boats: { id: string, distance: number, isUser: boolean, color: string }[],
 *   length: number }} props length = course length in meters (or furthest boat for time races)
 */
export function CourseBar({ boats, length }) {
  if (!(length > 0)) return null;
  const pos = (d) => `${Math.min(100, Math.max(0, (d / length) * 100))}%`;
  const user = boats.find((b) => b.isUser);
  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: pos(user?.distance ?? 0) }]} />
      </View>
      {boats
        .filter((b) => !b.isUser)
        .map((b) => (
          <View
            key={b.id}
            style={[styles.dot, { left: pos(b.distance), backgroundColor: b.color }]}
          />
        ))}
      {user && <View style={[styles.dot, styles.user, { left: pos(user.distance) }]} />}
      <View style={styles.finish} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 18, justifyContent: 'center' },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.glassStrong,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.primary },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  user: {
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderColor: colors.text,
    borderWidth: 2.5,
  },
  finish: {
    position: 'absolute',
    right: -2,
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
});
