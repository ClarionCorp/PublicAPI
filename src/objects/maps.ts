export interface Map {
  id: string;
  appId: string;
  name: string;
  aliases?: string[];
}

export const maps: Map[] = [
  {
    id: 'GTD_AhtenCity',
    appId: 'GMD_AhtenCity',
    name: 'Ahten City',
  },
  {
    id: 'GTD_DigitalWorld',
    appId: 'GMD_DigitalWorld',
    name: 'AiMi App',
    aliases: ["Ai.Mi's App"]
  },
  {
    id: 'GTD_Lab',
    appId: 'GMD_AtlasLab',
    name: "Atlas's Lab",
  },
  {
    id: 'GTD_ClarionCorpDefault',
    appId: 'GMD_ClarionCorp',
    name: 'Clarion Test Chamber',
  },
  {
    id: 'GTD_MusicStage',
    appId: 'GMD_MusicStage',
    name: 'Demon Dais',
  },
  {
    id: 'GTD_Obscura',
    appId: 'GMD_Obscura',
    name: 'Gates of Obscura',
  },
  {
    id: 'GTD_SummerSplash',
    appId: 'GMD_SummerSplash',
    name: "Inky's Splash Zone",
  },
  {
    id: 'GTD_NightMarket',
    appId: 'GMD_NightMarket',
    name: 'Night Market',
  },
  {
    id: 'GTD_OniVillage',
    appId: 'GMD_OniVillage',
    name: 'Oni Village',
  },
  {
    id: 'GTD_Drums',
    appId: 'GMD_Drums',
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

export function getMapFromAppId(appId: string): Map | undefined {
  return maps.find(map => map.appId === appId);
}

export function getMapNameFromId(id: string): string | undefined {
  return getMapFromId(id)?.name;
}

export default maps;
