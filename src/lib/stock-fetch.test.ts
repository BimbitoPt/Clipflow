import { describe, expect, it } from "vitest";
import { generatedPoolModule, mapPexelsVideo, mapPixabayVideo, mergeClips, MAX_FETCHED_CLIPS, type FetchedClip } from "./stock-fetch";

const NOW = "2026-10-12T00:00:00.000Z";

describe("stock fetch mapping", () => {
  it("maps a Pexels portrait video to a pool clip with query keywords", () => {
    const clip = mapPexelsVideo({
      id: 123, duration: 12, url: "https://www.pexels.com/video/123/",
      video_files: [
        { width: 1920, height: 1080, quality: "hd", link: "https://cdn/hd.mp4" },
        { width: 1080, height: 1920, quality: "hd", link: "https://cdn/portrait.mp4" },
        { width: 640, height: 360, quality: "sd", link: "https://cdn/sd.mp4" },
      ],
    }, "coding screen developer", NOW);
    expect(clip).toMatchObject({
      kind: "video", provider: "pexels", id: "123",
      src: "/broll/fetched/pexels-123.mp4",
      width: 1080, height: 1920, seconds: 12, fetchedAt: NOW,
    });
    expect(clip!.keywords).toEqual(["coding", "screen", "developer"]);
  });

  it("rejects Pexels clips outside the duration band or without a usable rendition", () => {
    expect(mapPexelsVideo({ id: 1, duration: 2, url: "u", video_files: [] }, "q", NOW)).toBeNull();
    expect(mapPexelsVideo({ id: 2, duration: 90, url: "u", video_files: [] }, "q", NOW)).toBeNull();
    expect(mapPexelsVideo({ id: 3, duration: 10, url: "u", video_files: [{ width: 3840, height: 2160, quality: "uhd", link: "u" }] }, "q", NOW)).toBeNull();
  });

  it("maps a Pixabay video, keeping its tags as keywords and preferring portrait", () => {
    const portrait = mapPixabayVideo({
      id: 77, duration: 8, pageURL: "https://pixabay.com/videos/77/", tags: "city, night",
      videos: { medium: { url: "https://cdn/77-m.mp4", width: 1080, height: 1920 }, small: { url: "https://cdn/77-s.mp4", width: 640, height: 1136 } },
    }, "urban journey", NOW);
    expect(portrait).toMatchObject({ provider: "pixabay", src: "/broll/fetched/pixabay-77.mp4", width: 1080, height: 1920 });
    expect(portrait!.keywords).toEqual(["city", "night", "urban", "journey"]);

    const landscape = mapPixabayVideo({
      id: 78, duration: 8, pageURL: "p", tags: "desk",
      videos: { medium: { url: "m", width: 1920, height: 1080 }, small: { url: "s", width: 960, height: 540 } },
    }, "work", NOW);
    expect(landscape).toMatchObject({ src: "/broll/fetched/pixabay-78.mp4", width: 960, height: 540 });
  });

  it("merges, dedupes by provider+id and caps the pool", () => {
    const clip = (id: string, fetchedAt: string): FetchedClip => ({
      kind: "video", src: `/broll/fetched/pexels-${id}.mp4`, keywords: [], provider: "pexels", id,
      width: 1080, height: 1920, seconds: 10, pageUrl: "p", fetchedAt,
    });
    const merged = mergeClips([clip("1", "2026-10-01T00:00:00.000Z"), clip("2", "2026-10-02T00:00:00.000Z")], [clip("1", "2026-10-11T00:00:00.000Z")], NOW);
    expect(merged.version).toBe(1);
    expect(merged.fetchedAt).toBe(NOW);
    expect(merged.clips).toHaveLength(2);
    expect(merged.clips.find((c) => c.id === "1")!.fetchedAt).toBe("2026-10-11T00:00:00.000Z");
    const many = mergeClips([], Array.from({ length: MAX_FETCHED_CLIPS + 10 }, (_, i) => clip(String(i), NOW)), NOW);
    expect(many.clips).toHaveLength(MAX_FETCHED_CLIPS);
  });

  it("renders a committable pool module", () => {
    const module = generatedPoolModule([{ kind: "video", src: "/broll/fetched/pexels-1.mp4", keywords: ["code"], provider: "pexels", id: "1", width: 1080, height: 1920, seconds: 9, pageUrl: "p", fetchedAt: NOW }]);
    expect(module).toContain('export const FETCHED_STOCK: PoolEntry[] = [');
    expect(module).toContain('{ kind: "video", src: "/broll/fetched/pexels-1.mp4", keywords: ["code"] },');
    expect(generatedPoolModule([])).toContain("FETCHED_STOCK: PoolEntry[] = [\n];");
  });
});
