export async function promiseAllInBatches<T>(
  list: (() => Promise<T>)[],
  batchSize: number
) {
  let position = 0;
  let results: PromiseSettledResult<Awaited<T>>[] = [];
  while (position < list.length) {
    console.log(`batching: ${position}/${list.length} ... `);
    const itemsForBatch = list.slice(position, position + batchSize);
    results = [
      ...results,
      ...(await Promise.allSettled(itemsForBatch.map((item) => item()))),
    ];
    position += batchSize;
    await new Promise((r) => setTimeout(r, 1));
  }

  return results;
}
