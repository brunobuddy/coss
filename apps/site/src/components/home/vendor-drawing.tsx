import { Block, MODULE_SIZE, Module, Socket } from "./iso";
import { type PartId, PRODUCTS } from "./parts";

/*
 * The comparison's two drawings, at one scale: four products from four vendors, each on a base of
 * its own, or the same four seated in one coss.com base.
 */

const SOCKET = 104;
const MARGIN = 14;
const RECESS = 6;
const HEIGHT = 20;
const SPREAD = 180;
const INSET = (SOCKET - MODULE_SIZE) / 2;

// Grid position of each product, back to front (drawing order).
const CELLS: [PartId, number, number][] = [
  ["inboxes", 0, 0],
  ["sms", 1, 0],
  ["scheduling", 0, 1],
  ["email", 1, 1],
];

export function VendorDrawing({ together, className }: { together: boolean; className?: string }) {
  return (
    <svg aria-hidden className={className} viewBox="-290 -60 580 400">
      {together ? <OneBase /> : <SeparateBases />}
    </svg>
  );
}

function SeparateBases() {
  return CELLS.map(([id, column, row]) => {
    const sx = column * SPREAD + MARGIN;
    const sy = row * SPREAD + MARGIN;
    const name = PRODUCTS.find((p) => p.id === id)?.name.toLowerCase() ?? id;
    return (
      <g key={id}>
        <Block
          box={{
            x: sx - MARGIN,
            y: sy - MARGIN,
            z: 0,
            w: SOCKET + MARGIN * 2,
            d: SOCKET + MARGIN * 2,
            h: HEIGHT,
          }}
        />
        <Socket depth={RECESS} size={SOCKET} x={sx} y={sy} z={HEIGHT} />
        <Module
          call={`${name} api`}
          part={id}
          stamp=""
          x={sx + INSET}
          y={sy + INSET}
          z={HEIGHT - RECESS}
        />
      </g>
    );
  });
}

function OneBase() {
  // Centred within the area the four separate bases cover.
  const size = MARGIN * 3 + SOCKET * 2;
  const shift = (SPREAD + SOCKET + MARGIN * 2 - size) / 2;
  const seat = (index: number) => shift + MARGIN + index * (SOCKET + MARGIN);
  return (
    <>
      <Block box={{ x: shift, y: shift, z: 0, w: size, d: size, h: HEIGHT }} />
      {CELLS.map(([id, column, row]) => (
        <Socket depth={RECESS} key={id} size={SOCKET} x={seat(column)} y={seat(row)} z={HEIGHT} />
      ))}
      {CELLS.map(([id, column, row]) => {
        const product = PRODUCTS.find((p) => p.id === id);
        if (!product) return null;
        return (
          <Module
            call={product.call}
            key={id}
            part={id}
            x={seat(column) + INSET}
            y={seat(row) + INSET}
            z={HEIGHT - RECESS}
          />
        );
      })}
    </>
  );
}
