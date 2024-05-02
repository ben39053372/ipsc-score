import { Storage } from "@google-cloud/storage";

export async function uploadJson(name: string, contents: string) {
  const bucketName = "ipsc-score";
  const destFileName = name;
  const storage = new Storage();
  await storage.bucket(bucketName).file(destFileName).save(contents);
  console.log(
    `${destFileName} with contents ${contents} uploaded to ${bucketName}.`
  );
}
