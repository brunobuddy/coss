import { Children, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius, space, useFinish } from "../lib/theme";
import { CountUp } from "./count-up";
import { Text } from "./text";

/** The dashboard's `StatRow`: measured values ruled into cells, two to a row. */
export function StatGrid(props: { children: ReactNode }) {
  const cells = Children.toArray(props.children).map((cell) => ({
    key: isValidElement(cell) ? String(cell.key) : String(cell),
    cell,
  }));
  const finish = useFinish();
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return (
    <View style={[styles.grid, { boxShadow: finish.panel }]}>
      {rows.map((row) => (
        <View key={row[0]?.key} style={[styles.row, row !== rows[0] && styles.rowRule]}>
          {row.map(({ key, cell }) => (
            <View key={key} style={[styles.cell, key !== row[0]?.key && styles.cellRule]}>
              {cell}
            </View>
          ))}
          {row.length === 1 ? <View style={[styles.cell, styles.cellRule]} /> : null}
        </View>
      ))}
    </View>
  );
}

export function Stat(props: { label: string; value: string; unit?: string; detail?: string }) {
  return (
    <View style={styles.stat}>
      <Text muted variant="small">
        {props.label}
      </Text>
      <View style={styles.value}>
        <CountUp
          adjustsFontSizeToFit={props.value.length > 8}
          minimumFontScale={0.6}
          numberOfLines={1}
          style={styles.number}
          value={props.value}
          variant="value"
        />
        {props.unit ? (
          <Text muted style={styles.unit} variant="body">
            {props.unit}
          </Text>
        ) : null}
      </View>
      {props.detail ? (
        <Text muted numberOfLines={2} variant="mono">
          {props.detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  row: { flexDirection: "row" },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cell: { flex: 1 },
  cellRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  stat: { gap: space.xs, paddingHorizontal: space.lg, paddingVertical: 14 },
  value: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  unit: { fontSize: 17 },
  number: { flexShrink: 1 },
});
