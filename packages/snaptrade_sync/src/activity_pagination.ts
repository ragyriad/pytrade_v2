export const SNAPTRADE_ACTIVITY_PAGE_SIZE = 1000;

export async function fetchAllActivityPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = SNAPTRADE_ACTIVITY_PAGE_SIZE
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`Invalid activity page size: ${pageSize}`);
  }

  const activities: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    activities.push(...page);
    if (page.length < pageSize) return activities;
  }
}
