import type { Venue } from "../types";

export type VenueInput = Venue | undefined;

/**
 * Injected into AI prompt generators so tasks match where the party actually is.
 * Park is the default (original behaviour); bar switches the scenery and tone.
 */
export function venuePromptContext(venue: VenueInput): string {
  if (venue === "bar") {
    return `ЛОКАЦИЯ: уютный бар (бодега), вечер дня рождения. Внутри: столики, барная стойка, бокалы, тёплый свет, музыка, тесно и весело. На улице плохая погода — все уже согрелись и осмелели.
Задания должны быть выполнимы ЗА СТОЛОМ или в пределах бара: без беготни по улице, без криков на всё помещение. Реквизит сцены: напитки, салфетки, меню, телефоны, соседи по столику. Шути про тосты, барную философию и то, как «по одной» превращается в «ещё по одной».`;
  }
  return `ЛОКАЦИЯ: городской парк, день. Простор, деревья, скамейки, прохожие. Задания могут быть активными: бегать, орать, изображать сценки.`;
}
