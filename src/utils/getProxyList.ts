export const getProxyList = async () => {
  const res = await fetch(
    "https://proxylist.geonode.com/api/proxy-list?country=HK&speed=fast&limit=50&page=1&sort_by=lastChecked&sort_type=desc"
  );
  const json = await res.json();
  const data = json.data;
  return data.map(
    (proxy) => `${proxy.protocols[0]}://${proxy.ip}:${proxy.port}`
  );
};
