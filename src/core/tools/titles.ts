import { Title, titles } from '../../objects/titles';

export type TitleObject = {
  id: string,
  en: string,
  jp?: string | null,
  unlockMethod?: string | null,
}

// Resolves their title from the ID
export function getTitleFromID(id: string): Title | undefined {
  return titles.find(t => t.id === id)
}