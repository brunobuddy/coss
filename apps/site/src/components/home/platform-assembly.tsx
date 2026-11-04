import { Block, iso, type Mark, MODULE_HEIGHT, MODULE_SIZE, Module, Socket } from "./iso";
import { PRODUCTS } from "./parts";

/*
 * The platform plate: one wide base with the products seated along the front and the pieces they
 * share (keys, domains, webhooks, logs) seated behind them. Blocks drop in back to front on load.
 */

const SOCKET = 104;
const PITCH = 128;
const MARGIN = 14;
const RECESS = 6;
const COLUMNS = 4;
const BASE = {
  x: 0,
  y: 0,
  z: 0,
  w: MARGIN * 2 + PITCH * (COLUMNS - 1) + SOCKET,
  d: MARGIN * 2 + PITCH + SOCKET,
  h: 20,
};
const SEAT = BASE.h - RECESS;

interface Seat {
  mark: Mark;
  name: string;
  call: string;
  column: number;
  row: 0 | 1;
}

const PLATFORM: Seat[] = [
  { mark: "keys", name: "Keys", call: "new Coss()", column: 0, row: 0 },
  { mark: "domains", name: "Domains", call: "coss.domains", column: 1, row: 0 },
  { mark: "webhooks", name: "Webhooks", call: "verifyWebhook()", column: 2, row: 0 },
  { mark: "logs", name: "Logs", call: "coss.logs", column: 3, row: 0 },
];

const SEATS: Seat[] = [
  ...PLATFORM,
  ...PRODUCTS.map((product, column) => ({
    mark: product.id,
    name: product.name,
    call: product.call,
    column,
    row: 1 as const,
  })),
];

// Back to front: nearer blocks overlap farther ones.
const ORDER = [...SEATS].sort((a, b) => a.column + a.row - (b.column + b.row) || a.row - b.row);

function seatOrigin(seat: Seat): [number, number] {
  const offset = (SOCKET - MODULE_SIZE) / 2;
  return [MARGIN + seat.column * PITCH + offset, MARGIN + seat.row * PITCH + offset];
}

export function PlatformAssembly({ className }: { className?: string }) {
  const [labelX, labelY] = iso([0, BASE.d, BASE.h]);
  return (
    <svg
      aria-labelledby="platform-title"
      className={className}
      role="img"
      viewBox="-600 -90 1420 540"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="platform-title">
        The coss.com platform: email, SMS, inboxes and scheduling seated along the front of one
        base, with the keys, domains, webhooks and logs they share seated behind them.
      </title>
      <Block box={BASE} />
      <text
        className="fill-current font-mono opacity-70"
        fontSize={11}
        transform={`matrix(${Math.cos(Math.PI / 6)} 0.5 0 1 ${labelX} ${labelY})`}
        x={14}
        y={14}
      >
        npm install coss
      </text>
      {SEATS.map((seat) => (
        <Socket
          depth={RECESS}
          key={seat.mark}
          size={SOCKET}
          x={MARGIN + seat.column * PITCH}
          y={MARGIN + seat.row * PITCH}
          z={BASE.h}
        />
      ))}
      {ORDER.map((seat, order) => {
        const [x, y] = seatOrigin(seat);
        return (
          <g
            className="assembly-seat"
            key={seat.mark}
            style={{ animationDelay: `${0.2 + order * 0.08}s` }}
          >
            <Module call={seat.call} part={seat.mark} x={x} y={y} z={SEAT} />
          </g>
        );
      })}
      <Callout
        anchor={seatCorner(
          SEATS.find((seat) => seat.row === 1 && seat.column === 0),
          "left",
        )}
        label="Products"
        note="email · sms · inboxes · scheduling"
        side="left"
      />
      <Callout
        anchor={seatCorner(
          SEATS.find((seat) => seat.row === 0 && seat.column === COLUMNS - 1),
          "right",
        )}
        label="Platform"
        note="keys · domains · webhooks · logs"
        side="right"
      />
    </svg>
  );
}

/** A seated block's outermost top corner on one side, in screen units: leaders start clear of it. */
function seatCorner(seat: Seat | undefined, side: "left" | "right"): [number, number] {
  if (!seat) return [0, 0];
  const [x, y] = seatOrigin(seat);
  const top = SEAT + MODULE_HEIGHT;
  return side === "left" ? iso([x, y + MODULE_SIZE, top]) : iso([x + MODULE_SIZE, y, top]);
}

/** A row's callout: a level leader out of the drawing to its name and what the row holds. */
function Callout({
  anchor: [ax, ay],
  label,
  note,
  side,
}: {
  anchor: [number, number];
  label: string;
  note: string;
  side: "left" | "right";
}) {
  const end = side === "left" ? ax - 120 : ax + 120;
  const textX = side === "left" ? end - 12 : end + 12;
  const anchorText = side === "left" ? "end" : "start";
  return (
    <g className="text-foreground">
      <path
        className="opacity-50"
        d={`M${ax} ${ay} L${end} ${ay}`}
        fill="none"
        stroke="currentColor"
        vectorEffect="non-scaling-stroke"
      />
      <circle className="fill-current" cx={ax} cy={ay} r={3} />
      <circle className="fill-current" cx={end} cy={ay} r={3} />
      <text
        className="fill-current"
        dominantBaseline="central"
        fontSize={20}
        textAnchor={anchorText}
        x={textX}
        y={ay - 11}
      >
        {label}
      </text>
      <text
        className="fill-current font-mono opacity-60"
        dominantBaseline="central"
        fontSize={12}
        textAnchor={anchorText}
        x={textX}
        y={ay + 13}
      >
        {note}
      </text>
    </g>
  );
}
