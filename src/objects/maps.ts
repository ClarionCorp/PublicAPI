export interface Map {
  id: string;
  name: string;
  aliases?: string[];
}

export const maps: Map[] = [
  {
    id: 'GTD_AhtenCity',
    name: 'Ahten City',
  },
  {
    id: 'GTD_DigitalWorld',
    name: 'AiMi App',
    aliases: ["Ai.Mi's App"]
  },
  {
    id: 'GTD_Lab',
    name: "Atlas's Lab",
  },
  {
    id: 'GTD_ClarionCorpDefault',
    name: 'Clarion Test Chamber',
  },
  {
    id: 'GTD_MusicStage',
    name: 'Demon Dais',
  },
  {
    id: 'GTD_Obscura',
    name: 'Gates of Obscura',
  },
  {
    id: 'GTD_SummerSplash',
    name: "Inky's Splash Zone",
  },
  {
    id: 'GTD_NightMarket',
    name: 'Night Market',
  },
  {
    id: 'GTD_OniVillage',
    name: 'Oni Village',
  },
  {
    id: 'GTD_Drums',
    name: 'Taiko Temple',
  },
];

export function getMapFromName(name: string): Map | undefined {
  const lowerName = name.toLowerCase();
  return maps.find(map =>
    map.name.toLowerCase() === lowerName ||
    map.aliases?.some(alias => alias.toLowerCase() === lowerName)
  );
}

export function getMapIdFromName(name: string): string | undefined {
  return getMapFromName(name)?.id;
}

export function getMapFromId(id: string): Map | undefined {
  return maps.find(map => map.id === id);
}

export function getMapNameFromId(id: string): string | undefined {
  return getMapFromId(id)?.name;
}

export default maps;
