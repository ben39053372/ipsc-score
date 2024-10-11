export const withProxy = (url: string, index: number = 1) => {
  const proxyUrl = `https://proxy-workers${
    (index % 10) + 1
  }.ilovehk-ben.workers.dev/proxy?modify&proxyUrl=${url}`;
  console.log({ proxyUrl });
  return proxyUrl;
};
