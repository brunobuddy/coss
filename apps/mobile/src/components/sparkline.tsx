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

/** The line draws itself once; afterwards it's a plain path, so nothing can be left half drawn. */
function DrawnLine(props: { d: string; length: number; color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: motion.draw,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    });
  }, [progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: props.length * (1 - progress.value),
  }));
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      d={props.d}
      fill="none"
      stroke={props.color}
      strokeDasharray={[props.length, props.length]}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
    />
  );
}

/** The dashboard's `Sparkline`: recent values (oldest first) over a soft fill of its colour. */
export function Sparkline(props: { id: string; values: number[]; color: string; height?: number }) {
  const height = props.height ?? 32;
  const [width, setWidth] = useState(0);
  const arrived = useArrival();
  const reduced = useReducedMotion();
  const [drawing, setDrawing] = useState(arrived && !reduced);
  useEffect(() => {
    if (!drawing || width === 0) return;
    const timer = setTimeout(() => setDrawing(false), motion.draw + 100);
    return () => clearTimeout(timer);
  }, [drawing, width]);

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
          <Path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradient})`} />
          {drawing ? (
            <DrawnLine color={props.color} d={line} length={length} />
          ) : (
            <Path
              d={line}
              fill="none"
              stroke={props.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
            />
          )}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ frame: { width: "100%", overflow: "visible" } });
