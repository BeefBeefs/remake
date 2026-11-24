/** Episode data overlay. Episode N's data folder (data/epN) holds only what the Episode N patch added or changed; manifest.json lists its files.
 *  Data.url('maps/x.json') returns the path in the highest selected episode that holds the file, falling back down to Episode 1 (which holds everything of the base game and has no manifest).
 *  A rel name without extension (a sprite set such as 'actors/enemy/10') matches when `<rel>.json` is in the manifest. */
export class Data {
  static ep = 1;
  private static manifests = new Map<number, Set<string>>();
  /** Select the episode and fetch the manifests of Episodes 2..ep. */
  static async init(ep: number) {
    Data.ep = ep;
    await Promise.all([2, 3, 4].filter(e => e <= ep && !Data.manifests.has(e)).map(async e => {
      try { Data.manifests.set(e, new Set<string>(await (await fetch(`data/ep${e}/manifest.json`)).json())); } catch { Data.manifests.set(e, new Set()); }
    }));
  }
  static url(rel: string): string {
    for (let e = Data.ep; e >= 2; e--) {
      const m = Data.manifests.get(e);
      if (m && (m.has(rel) || m.has(rel + '.json'))) return `data/ep${e}/${rel}`;
    }
    return `data/ep1/${rel}`;
  }
}
