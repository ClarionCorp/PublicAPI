export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const isObjectId = (value: string): boolean =>
  /^[0-9a-fA-F]{24}$/.test(value);

export function getTypeOfInput(input: string): string {
  if (isObjectId(input)) { return 'id' }
  else { return 'username' }
}