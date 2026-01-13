export interface Map {
  id: string;
  name: string;
}

export const maps: Map[] = [
  {
    id: 'Ahten',
    name: 'Ahten City',
  },
  {
    id: 'AiMiApp',
    name: 'AiMi App',
  },
  {
    id: 'AtlasLab',
    name: "Atlas's Lab",
  },
  {
    id: 'ClarionCorp',
    name: 'Clarion Test Chamber',
  },
  {
    id: 'DemonDais',
    name: 'Demon Dais',
  },
  {
    id: 'GatesOfObscura',
    name: 'Gates of Obscura',
  },
  {
    id: 'InkySplashZone',
    name: "Inky's Splash Zone",
  },
  {
    id: 'NightMarket',
    name: 'Night Market',
  },
  {
    id: 'OniVillage',
    name: 'Oni Village',
  },
  {
    id: 'TaikoTemple',
    name: 'Taiko Temple',
  },
];

export function getMapFromName(name: string): Map | undefined {
  return maps.find(map => map.name.toLowerCase() === name.toLowerCase());
}

export function getMapIdFromName(name: string): string | undefined {
  return getMapFromName(name)?.id;
}

export default maps;
