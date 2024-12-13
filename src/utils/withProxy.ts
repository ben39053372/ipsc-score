export const withProxy = (url: string, index: number = 1) => {
  let proxyUrl;
  if (index % 2) {
    proxyUrl = `https://proxy-workers${
      (index % 10) + 1
    }.ilovehk-ben.workers.dev/proxy?modify&proxyUrl=${url}`;
  } else {
    proxyUrl = `https://proxy-workers${
      (index % 10) + 1
    }.brcs68m5yk.workers.dev/proxy?modify&proxyUrl=${url}`;
  }

  console.log({ proxyUrl });
  return proxyUrl;
};
