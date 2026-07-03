import type { Venue } from "../types";

export type VenueInput = Venue | undefined;

/**
 * Injected into AI prompt generators so tasks match where the party actually is.
 * Park is the default (original behaviour); bar switches the scenery and tone.
 */
export function venuePromptContext(venue: VenueInput): string {
  if (venue === "bar") {
    return `LOCATION: a cozy bar (bodega), birthday evening. Inside: tables, bar counter, glasses, warm light, music, crowded and fun. Bad weather outside — everyone is warmed up and bold.
Tasks must be doable AT THE TABLE or within the bar: no running in the street, no shouting across the whole room. Scene props: drinks, napkins, menus, phones, table neighbors. Joke about toasts, bar philosophy, and how "just one more" becomes "one more again."`;
  }
  return `LOCATION: city park, daytime. Open space, trees, benches, passersby. Tasks can be active: run, yell, act out scenes.`;
}
