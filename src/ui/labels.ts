/** Human-readable names for skill items (see itemsFor in curriculum/generator.ts). */
import { STEP_NAMES, keyName, parseKeyId } from "../music/pitch";

const INTERVAL = ["unison", "second", "third", "fourth", "fifth", "sixth", "seventh", "octave", "ninth", "tenth"];

export function itemLabel(item: string): string {
  const [kind, a, b] = item.split(":");
  switch (kind) {
    case "read": {
      const pos = Number(b);
      return `${STEP_NAMES[((pos % 7) + 7) % 7]}${Math.floor(pos / 7)} on the ${a} staff`;
    }
    case "ks": {
      const key = parseKeyId(a!);
      const step = Number(b);
      const sharp = key.fifths > 0;
      return `${STEP_NAMES[step]}${sharp ? "♯" : "♭"} from the key signature (${keyName(key)})`;
    }
    case "acc":
      return a === "up" ? "Accidentals raising a note" : "Accidentals lowering a note";
    case "int": {
      const d = Number(b);
      const name = INTERVAL[Math.abs(d)] ?? `${Math.abs(d) + 1}th`;
      return `${a === "R" ? "Right" : "Left"} hand: ${name} ${d > 0 ? "up" : "down"}`;
    }
    case "chord":
      return `${a === "R" ? "Right" : "Left"}-hand ${b === "2" ? "two-note chords" : b === "3" ? "triads" : `${b}-note chords`}`;
    default:
      return item;
  }
}
