import type { ReactNode } from "react";
import type { Mark } from "@/lib/marks";

/**
 * What a block can carry on its top face: a product, or one of the platform pieces they share
 * (listed in `MARKS`, src/lib/marks.ts, which the pages' frontmatter is checked against).
 */
export type { Mark } from "@/lib/marks";

/*
 * Isometric line drawings in the manner of a parts catalog. Geometry is in "catalog units":
 * x runs to the lower right, y to the lower left, z up. Flat artwork (engravings, labels) is drawn in
 * 2D and mapped onto a face with an affine matrix, so it foreshortens like the face does.
 */

const C = Math.cos(Math.PI / 6);
const S = 0.5;

type P3 = readonly [number, number, number];

export function iso([x, y, z]: P3): [number, number] {
  return [(x - y) * C, (x + y) * S - z];
}

function points(corners: readonly P3[]): string {
  return corners
    .map((corner) => {
      const [sx, sy] = iso(corner);
      return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    })
    .join(" ");
}

/** Maps 2D artwork onto the top face at height z, with its origin at (x, y). */
function onTop(x: number, y: number, z: number): string {
  const [tx, ty] = iso([x, y, z]);
  return `matrix(${C} ${S} ${-C} ${S} ${tx} ${ty})`;
}

/** Maps 2D artwork onto the face looking down-left (the plane y = const), origin at its top-left. */
function onLeft(x: number, y: number, z: number): string {
  const [tx, ty] = iso([x, y, z]);
  return `matrix(${C} ${S} 0 1 ${tx} ${ty})`;
}

/** Maps 2D artwork onto the face looking down-right (the plane x = const), origin at its top-left. */
function onRight(x: number, y: number, z: number): string {
  const [tx, ty] = iso([x, y, z]);
  return `matrix(${C} ${-S} 0 1 ${tx} ${ty})`;
}

export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinejoin: "round",
  strokeLinecap: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

/** The three visible faces of a box. */
export function Block({ box }: { box: Box }) {
  const { x, y, z, w, d, h } = box;
  const top: P3[] = [
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ];
  const left: P3[] = [
    [x, y + d, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ];
  const right: P3[] = [
    [x + w, y, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x + w, y, z + h],
  ];
  return (
    <g>
      <polygon className="fill-(--iso-left)" points={points(left)} {...LINE} fill={undefined} />
      <polygon className="fill-(--iso-right)" points={points(right)} {...LINE} fill={undefined} />
      <polygon className="fill-(--iso-top)" points={points(top)} {...LINE} fill={undefined} />
    </g>
  );
}

/** A square recess cut into a top surface at height z. */
function Socket({
  x,
  y,
  z,
  size,
  depth,
}: {
  x: number;
  y: number;
  z: number;
  size: number;
  depth: number;
}) {
  const floor = z - depth;
  return (
    <g>
      <polygon
        className="fill-(--iso-left)"
        points={points([
          [x, y, floor],
          [x + size, y, floor],
          [x + size, y + size, floor],
          [x, y + size, floor],
        ])}
        {...LINE}
        fill={undefined}
      />
      {/* The two inner walls that face the viewer. */}
      <polygon
        className="fill-(--iso-right)"
        points={points([
          [x, y, z],
          [x + size, y, z],
          [x + size, y, floor],
          [x, y, floor],
        ])}
        {...LINE}
        fill={undefined}
      />
      <polygon
        className="fill-(--iso-left)"
        points={points([
          [x, y, z],
          [x, y + size, z],
          [x, y + size, floor],
          [x, y, floor],
        ])}
        {...LINE}
        fill={undefined}
      />
    </g>
  );
}

/** Each part's mark, drawn in a 92 × 92 square and engraved on its block's top face. */
function Engraving({ part }: { part: Mark }): ReactNode {
  switch (part) {
    case "email":
      return (
        <>
          <rect height={44} rx={3} width={60} x={16} y={24} {...LINE} />
          <path d="M16 27 L46 50 L76 27" {...LINE} />
        </>
      );
    case "sms":
      return (
        <>
          <path
            d="M22 20 H70 a8 8 0 0 1 8 8 V54 a8 8 0 0 1 -8 8 H42 L28 74 V62 H22 a8 8 0 0 1 -8 -8 V28 a8 8 0 0 1 8 -8 Z"
            {...LINE}
          />
          <circle cx={34} cy={41} r={2.5} {...LINE} />
          <circle cx={46} cy={41} r={2.5} {...LINE} />
          <circle cx={58} cy={41} r={2.5} {...LINE} />
        </>
      );
    case "scheduling":
      return (
        <>
          <rect height={54} rx={4} width={58} x={17} y={22} {...LINE} />
          <path d="M17 36 H75 M31 15 V28 M61 15 V28" {...LINE} />
          {[0, 1, 2].flatMap((row) =>
            [0, 1, 2, 3].map((col) => (
              <rect
                height={6}
                key={`${row}-${col}`}
                width={6}
                x={25 + col * 12}
                y={43 + row * 10}
                {...LINE}
                className={row === 1 && col === 2 ? "fill-current" : undefined}
                fill={row === 1 && col === 2 ? undefined : "none"}
              />
            )),
          )}
        </>
      );
    case "webhooks":
      return (
        <>
          <circle cx={46} cy={26} r={8} {...LINE} />
          <circle cx={24} cy={64} r={8} {...LINE} />
          <circle cx={68} cy={64} r={8} {...LINE} />
          <path d="M42 33 L28 57 M50 33 L64 57 M32 64 H60" {...LINE} />
        </>
      );
    case "logs":
      return (
        <>
          <rect height={56} rx={4} width={56} x={18} y={18} {...LINE} />
          <path d="M28 32 H64 M28 42 H56 M28 52 H62 M28 62 H48" {...LINE} />
        </>
      );
    case "domains":
      return (
        <>
          <circle cx={46} cy={46} r={27} {...LINE} />
          <ellipse cx={46} cy={46} rx={11} ry={27} {...LINE} />
          <path d="M19 46 H73 M24 32 H68 M24 60 H68" {...LINE} />
        </>
      );
    case "keys":
      return (
        <>
          <circle cx={32} cy={46} r={13} {...LINE} />
          <circle cx={32} cy={46} r={4} {...LINE} />
          <path d="M45 46 H76 M68 46 V56 M58 46 V53" {...LINE} />
        </>
      );
    case "inboxes":
      return (
        <>
          <path d="M16 50 L26 22 H66 L76 50 V70 H16 Z" {...LINE} />
          <path d="M16 50 H34 L38 58 H54 L58 50 H76 M34 34 H58" {...LINE} />
        </>
      );
    case "inbound":
      return (
        <>
          <rect height={34} rx={3} width={60} x={16} y={42} {...LINE} />
          <path d="M16 45 L46 64 L76 45 M46 12 V34 M37 25 L46 34 L55 25" {...LINE} />
        </>
      );
    case "subaccounts":
      return (
        <>
          <rect height={16} rx={2} width={26} x={33} y={14} {...LINE} />
          <path d="M46 30 V42 M22 42 H70 M22 42 V56 M46 42 V56 M70 42 V56" {...LINE} />
          <rect height={16} rx={2} width={20} x={12} y={56} {...LINE} />
          <rect height={16} rx={2} width={20} x={36} y={56} {...LINE} />
          <rect height={16} rx={2} width={20} x={60} y={56} {...LINE} />
        </>
      );
    case "smtp":
      return (
        <>
          <rect height={50} rx={4} width={64} x={14} y={21} {...LINE} />
          <path d="M24 37 L34 45 L24 53 M40 55 H58" {...LINE} />
        </>
      );
    case "marketing":
      return (
        <>
          <path d="M16 40 V54 H28 L60 70 V24 L28 40 Z M28 40 V54" {...LINE} />
          <path d="M30 55 L34 72 H42 L38 56 M68 38 A10 10 0 0 1 68 56" {...LINE} />
        </>
      );
    case "sign":
      return (
        <>
          <path d="M16 64 H78" {...LINE} />
          <path
            d="M20 54 C26 30 34 32 34 46 S42 60 48 42 S60 34 62 52 C64 58 70 56 74 50"
            {...LINE}
          />
          <path d="M18 72 L24 78 M24 72 L18 78" {...LINE} />
        </>
      );
    case "verify":
      return (
        <>
          <rect height={66} rx={6} width={36} x={28} y={13} {...LINE} />
          <path d="M40 70 H52" {...LINE} />
          <circle cx={37} cy={44} r={2.5} {...LINE} />
          <circle cx={46} cy={44} r={2.5} {...LINE} />
          <circle cx={55} cy={44} r={2.5} {...LINE} />
        </>
      );
    case "forms":
      return (
        <>
          <rect height={64} rx={4} width={56} x={18} y={14} {...LINE} />
          <rect height={8} rx={1.5} width={40} x={26} y={26} {...LINE} />
          <rect height={8} rx={1.5} width={40} x={26} y={42} {...LINE} />
          <rect height={8} rx={1.5} width={18} x={26} y={60} {...LINE} />
        </>
      );
    case "hooks":
      return (
        <>
          <circle cx={22} cy={46} r={8} {...LINE} />
          <path d="M30 46 H60 M29 41 L61 24 M29 51 L61 68" {...LINE} />
          <circle cx={68} cy={22} r={7} {...LINE} />
          <circle cx={68} cy={46} r={7} {...LINE} />
          <circle cx={68} cy={70} r={7} {...LINE} />
        </>
      );
    case "risk":
      return (
        <>
          <path d="M14 62 A32 32 0 0 1 78 62 Z" {...LINE} />
          <path d="M46 62 L62 38 M22 46 L27 49 M46 30 V36 M70 46 L65 49" {...LINE} />
          <circle cx={46} cy={62} r={3} {...LINE} />
        </>
      );
    case "limits":
      return (
        <>
          <path d="M28 16 H64 M28 76 H64" {...LINE} />
          <path d="M32 16 L46 46 L32 76 M60 16 L46 46 L60 76 M38 70 L46 60 L54 70" {...LINE} />
        </>
      );
    case "platform":
      return (
        <>
          <rect height={14} rx={3} width={56} x={18} y={18} {...LINE} />
          <rect height={14} rx={3} width={56} x={18} y={39} {...LINE} />
          <rect height={14} rx={3} width={56} x={18} y={60} {...LINE} />
        </>
      );
    case "security":
      return (
        <>
          <path d="M46 14 L74 24 V46 C74 62 62 72 46 78 C30 72 18 62 18 46 V24 Z" {...LINE} />
          <path d="M34 46 L43 55 L60 37" {...LINE} />
        </>
      );
    case "agents":
      return (
        <>
          <rect height={50} rx={10} width={60} x={16} y={24} {...LINE} />
          <path d="M46 24 V14 M37 58 H55" {...LINE} />
          <circle cx={46} cy={12} r={2.5} {...LINE} />
          <circle cx={35} cy={44} r={4} {...LINE} />
          <circle cx={57} cy={44} r={4} {...LINE} />
        </>
      );
    case "sdks":
      return (
        <path
          d="M36 18 C26 18 28 34 28 40 C28 44 25 46 20 46 C25 46 28 48 28 52 C28 58 26 74 36 74 M56 18 C66 18 64 34 64 40 C64 44 67 46 72 46 C67 46 64 48 64 52 C64 58 66 74 56 74"
          {...LINE}
        />
      );
  }
}

export const MODULE_SIZE = 92;
export const MODULE_HEIGHT = 30;

/** The side label's font size: 9.5, shrunk so long namespaces stay on the face (mono, ~0.62em per glyph). */
function labelSize(text: string): number {
  const room = MODULE_SIZE - 16;
  return Math.min(9.5, room / (text.length * 0.62));
}

/** A product block: its body, its mark on top and its SDK namespace printed on the side. */
export function Module({
  part,
  call,
  x,
  y,
  z,
  stamp = "coss.com",
}: {
  part: Mark;
  call: string;
  x: number;
  y: number;
  z: number;
  /** The maker's mark on the right face. */
  stamp?: string;
}) {
  const box = { x, y, z, w: MODULE_SIZE, d: MODULE_SIZE, h: MODULE_HEIGHT };
  const top = z + MODULE_HEIGHT;
  return (
    <g>
      <Block box={box} />
      <g transform={onTop(x, y, top)}>
        <Engraving part={part} />
      </g>
      <text
        className="fill-current font-mono"
        fontSize={labelSize(call)}
        transform={onLeft(x, y + MODULE_SIZE, top)}
        x={8}
        y={19}
      >
        {call}
      </text>
      <text
        className="fill-current font-mono opacity-60"
        fontSize={8}
        transform={onRight(x + MODULE_SIZE, y + MODULE_SIZE, top)}
        x={8}
        y={19}
      >
        {stamp}
      </text>
    </g>
  );
}

export { Socket };
