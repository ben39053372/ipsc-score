export const withProxy = (url: string, index: number = 1) => {
  const proxyUrl = `https://proxy-workers${
    (index % 10) + 1
  }.brcs68m5yk.workers.dev/proxy?modify&proxyUrl=${url}`;
  console.log({ proxyUrl });
  return proxyUrl;
};
