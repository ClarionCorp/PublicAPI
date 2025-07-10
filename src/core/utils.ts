import characters from "../objects/characters";
import { formatDistanceToNow } from "date-fns";
import dayjs from "dayjs";

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const isObjectId = (value: string): boolean =>
  /^[0-9a-fA-F]{24}$/.test(value);

export function getTypeOfInput(input: string): string {
  if (isObjectId(input)) { return 'id' }
  else { return 'username' }
}

export function areDifferentDays(dateString1: string, dateString2: string) {
  const format = 'YYYY-MM-DD HH:mm'

  const date1 = dayjs(dateString1, format)
  const date2 = dayjs(dateString2, format)

  const isDifferentDays = !date1.isSame(date2, 'day')

  return isDifferentDays
}

// Relative time. e.g. "3 hours ago"
export function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getCharacterFromDevName(cd_characterId: string) {
  return characters.find( character => character.id === cd_characterId)
}