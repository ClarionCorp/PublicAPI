import { CharacterObject } from "@/types/tools";
import { prisma } from "../../plugins/prisma";



export async function resolveCharacterID(id: string): Promise<CharacterObject | null> {
  try {
    const fetched = await prisma.strikers.findFirst({ where: { id } });
    return fetched;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function fetchCharacters(): Promise<CharacterObject[]> {
  try {
    const fetched = await prisma.strikers.findMany();
    return fetched;
  } catch (e) {
    console.error(e);
    return [];
  }
}