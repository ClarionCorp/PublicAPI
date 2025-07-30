import { prisma } from '../../plugins/prisma';

export type TitleObject = {
  id: string,
  en: string,
  jp?: string | null,
  unlockMethod?: string | null,
}

export async function getTitleFromID(id: string): Promise<TitleObject | null> {
  try {
    const fetched = await prisma.titles.findFirst({ where: { id } });
    return fetched;
  } catch (e) {
    console.error(e);
    return null;
  }
}