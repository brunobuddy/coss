import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { motion } from "../lib/theme";
import { useArrival } from "./screen";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The dashboard's `Sparkline`: recent values (oldest first) over a soft fill of its colour. */
export function Sparkline(props: { id: string; values: number[]; color: string; height?: number }) {
  const height = props.height ?? 32;
  const [width, setWidth] = useState(0);
  const arrived = useArrival();
  const reduced = useReducedMotion();
  const progress = useSharedValue(arrived && !reduced ? 0 : 1);

  const max = Math.max(1, ...props.values);
  const step = props.values.length > 1 ? width / (props.values.length - 1) : width;
  const points = props.values.map(
    (value, index) => [index * step, height - 2 - (value / max) * (height - 6)] as const,
  );
  const line = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1] ?? [0, 0];
    const [x1, y1] = points[i] ?? [0, 0];
    length += Math.hypot(x1 - x0, y1 - y0);
  }

  useEffect(() => {
    if (width === 0) return;
    progress.value = withTiming(1, {
      duration: motion.draw,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    });
  }, [progress, width]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  const areaProps = useAnimatedProps(() => ({ opacity: progress.value }));
  const gradient = `sparkline-${props.id}`;

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      pointerEvents="none"
      style={[styles.frame, { height }]}
    >
      {width > 0 && points.length > 0 ? (
        <Svg height={height} width={width}>
          <Defs>
            <LinearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={props.color} stopOpacity={0.18} />
              <Stop offset="1" stopColor={props.color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <AnimatedPath
            animatedProps={areaProps}
            d={`${line} L${width},${height} L0,${height} Z`}
            fill={`url(#${gradient})`}
          />
          <AnimatedPath
            animatedProps={lineProps}
            d={line}
            fill="none"
            stroke={props.color}
            strokeDasharray={[length, length]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ frame: { width: "100%", overflow: "visible" } });
